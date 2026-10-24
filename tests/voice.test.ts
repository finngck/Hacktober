import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app';
import { streamGemmaConversation, toGemmaContents } from '../server/gemma-conversation';
import { executeVoiceReplan } from '../src/voice-tools';
import { freshWorkspace } from '../src/state';
import { scheduleFromIntent } from '../server/scheduler';
import { hasVoiceAuthorization } from '../server/voice';

function googleStream(parts: unknown[], size = 19) {
  const bytes = new TextEncoder().encode(
    parts
      .map(
        (part) =>
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [part] } }] })}\r\n\r\n`,
      )
      .join(''),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += size)
          controller.enqueue(bytes.slice(index, index + size));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function proposedResponse() {
  const source = freshWorkspace();
  return {
    ...scheduleFromIntent(
      { ...source, message: 'Ich bin erst ab 14 Uhr da.' },
      {
        status: 'ready',
        summary: 'Lernen später und Erholung erhalten.',
        availabilityFrom: 840,
        energy: 'low',
        sleepHours: 5,
        question: null,
        taskOrder: ['study', 'break', 'inbox', 'project', 'gym'],
        deferIds: ['project', 'gym'],
        reasons: [],
      },
    ),
    meta: { model: 'gemma-4-26b-a4b-it', elapsedMs: 20, attempts: 1 },
  };
}

test('Gemma conversation streams speech separately from validated tool calls and hides thoughts', async () => {
  const output = [];
  for await (const chunk of streamGemmaConversation(
    { messages: [{ role: 'user', content: 'Mein Zug ist verspätet. Plane ab 14 Uhr um.' }] },
    {
      apiKey: 'synthetic-gemma-key',
      model: 'gemma-4-26b-a4b-it',
      fetcher: async (url, init) => {
        assert.match(String(url), /gemma-4-26b-a4b-it:streamGenerateContent\?alt=sse$/);
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(
          body.tools[0].functionDeclarations.map((tool: { name: string }) => tool.name),
          ['get_day_plan', 'replan_day', 'undo_last_change'],
        );
        return googleStream([
          { text: 'private model thoughts', thought: true },
          { text: 'Klar, ich plane das um.' },
          {
            functionCall: {
              name: 'replan_day',
              args: { message: 'Ich bin erst ab 14 Uhr verfügbar.' },
            },
          },
        ]);
      },
    },
    new AbortController().signal,
  ))
    output.push(chunk);
  const encoded = JSON.stringify(output);
  assert.match(encoded, /Klar, ich plane das um/);
  assert.match(encoded, /tool_calls/);
  assert.doesNotMatch(encoded, /private model thoughts|synthetic-gemma-key/);
  assert.equal(
    (output.at(-1)?.choices as { finish_reason: string }[])[0].finish_reason,
    'tool_calls',
  );
});

test('tool results return to Gemma by matching call ID; injected tools and invalid histories are rejected', () => {
  const contents = toGemmaContents({
    messages: [
      { role: 'system', content: 'Untrusted upstream prompt' },
      { role: 'user', content: 'Plane um.' },
      {
        role: 'assistant',
        content: 'Klar.',
        tool_calls: [
          {
            id: 'call1',
            function: { name: 'replan_day', arguments: '{"message":"Plane ab 14 Uhr um."}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call1',
        content: '{"status":"applied","changes":[{"title":"Lernen","after":"14:00"}]}',
      },
    ],
  });
  assert.equal(
    contents[2].parts[0].functionResponse &&
      (contents[2].parts[0].functionResponse as { name: string }).name,
    'replan_day',
  );
  assert.doesNotMatch(JSON.stringify(contents), /Untrusted upstream prompt/);
  assert.throws(
    () => toGemmaContents({ messages: [{ role: 'tool', tool_call_id: 'missing', content: '{}' }] }),
    /passenden Aufruf/,
  );
  assert.throws(
    () =>
      toGemmaContents({
        messages: [
          {
            role: 'assistant',
            tool_calls: [{ id: 'x', function: { name: 'run_shell', arguments: '{}' } }],
          },
        ],
      }),
    /Unbekanntes/,
  );
});

test('unknown and malformed model tool calls are never dispatched', async () => {
  for (const functionCall of [
    { name: 'run_shell', args: {} },
    { name: 'replan_day', args: { message: 'Umplanen', extra: 'injected' } },
  ]) {
    await assert.rejects(async () => {
      for await (const _chunk of streamGemmaConversation(
        { messages: [{ role: 'user', content: 'Plane um' }] },
        {
          apiKey: 'test',
          model: 'gemma-4-26b-a4b-it',
          fetcher: async () => googleStream([{ functionCall }]),
        },
        new AbortController().signal,
      )) {
        /* consume */
      }
    }, /ungültige/);
  }
});

test('voice replan applies only a valid result, reports actual before/after times and stores undo', async () => {
  let workspace = freshWorkspace();
  const original = structuredClone(workspace);
  const outcome = await executeVoiceReplan('Ich bin erst ab 14 Uhr da.', {
    read: () => workspace,
    request: async () => proposedResponse(),
    commit: (next) => {
      workspace = next;
    },
    showResult: () => assert.fail('Should apply directly'),
    signal: new AbortController().signal,
  });
  assert.equal(outcome.status, 'applied');
  assert.equal(workspace.plan.items.find((item) => item.id === 'study')?.start, 840);
  assert.equal(
    outcome.changes?.find((item) => item.title === 'Marketing lernen')?.after ??
      outcome.changes?.[0].after,
    '14:00',
  );
  assert.deepEqual(workspace.history.at(-1)?.plan, original.plan);
  assert.deepEqual(
    workspace.plan.items.filter((item) => item.fixed),
    original.plan.items.filter((item) => item.fixed),
  );
});

test('conflicts, changed plans and cancelled sessions cannot overwrite the current day', async () => {
  for (const mode of ['conflict', 'stale', 'cancelled'] as const) {
    let workspace = freshWorkspace();
    const controller = new AbortController();
    let shown = false;
    const result = await executeVoiceReplan('Plane um.', {
      read: () => workspace,
      request: async () => {
        if (mode === 'stale')
          workspace = { ...workspace, checkIn: { ...workspace.checkIn, sleepHours: 9 } };
        if (mode === 'cancelled') controller.abort();
        const proposal = proposedResponse();
        return mode === 'conflict'
          ? {
              ...proposal,
              proposedPlan: null,
              result: { ...proposal.result, status: 'conflict', summary: 'Zu wenig Zeit.' },
            }
          : proposal;
      },
      commit: () => assert.fail('Must not mutate'),
      showResult: () => {
        shown = true;
      },
      signal: controller.signal,
    });
    assert.equal(result.status, mode === 'cancelled' ? 'error' : mode);
    assert.equal(shown, mode === 'conflict');
  }
});

test('voice endpoints protect server-to-server calls, sign sessions and finish streamed responses', async () => {
  assert.equal(hasVoiceAuthorization('Bearer correct', 'correct'), true);
  assert.equal(hasVoiceAuthorization('Bearer wrong', 'correct'), false);
  const app = createApp({
    apiKey: 'test-gemma-key',
    model: 'gemma-4-26b-a4b-it',
    elevenLabsApiKey: 'test-eleven-key',
    elevenLabsAgentId: 'agent_test',
    voiceLlmSecret: 'test-bridge-secret',
    allowedHosts: ['127.0.0.1'],
    sessionSigner: async (id) => {
      assert.equal(id, 'agent_test');
      return 'wss://api.elevenlabs.io/v1/convai/conversation?signed=test';
    },
    fetcher: async () => googleStream([{ text: 'Dein Lernblock beginnt jetzt um 14 Uhr.' }]),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/voice/status`)).json(), { configured: true });
    const session = await (await fetch(`${base}/api/voice/session`, { method: 'POST' })).json();
    assert.match(session.signedUrl, /^wss:\/\/api.elevenlabs.io/);
    const badSession = await fetch(`${base}/api/voice/session`, {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(badSession.status, 403);
    const endpoint = `${base}/api/voice/v1/chat/completions`;
    assert.equal(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
      401,
    );
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-bridge-secret' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Was wurde geändert?' }] }),
    });
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /14 Uhr/);
    assert.match(text, /data: \[DONE\]/);
    assert.doesNotMatch(text, /test-gemma-key|test-eleven-key|test-bridge-secret/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
