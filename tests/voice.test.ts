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
      { ...source, message: "I'm only around from 14:00." },
      {
        status: 'ready',
        summary: 'Study later and keep recovery.',
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
    measures: { actions: [], restrictions: [] },
  };
}

test('Gemma conversation streams speech separately from validated tool calls and hides thoughts', async () => {
  const output = [];
  for await (const chunk of streamGemmaConversation(
    { messages: [{ role: 'user', content: 'My train is delayed. Replan from 14:00.' }] },
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
          { text: "Sure, I'll replan that." },
          {
            functionCall: {
              name: 'replan_day',
              args: { message: "I'm only available from 14:00." },
            },
          },
        ]);
      },
    },
    new AbortController().signal,
  ))
    output.push(chunk);
  const encoded = JSON.stringify(output);
  assert.match(encoded, /Sure, I'll replan that/);
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
      { role: 'user', content: 'Replan my day.' },
      {
        role: 'assistant',
        content: 'Sure.',
        tool_calls: [
          {
            id: 'call1',
            function: { name: 'replan_day', arguments: '{"message":"Replan from 14:00."}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call1',
        content: '{"status":"applied","changes":[{"title":"Study","after":"14:00"}]}',
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
    /matching call/,
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
    /Unknown/,
  );
});

test('unknown and malformed model tool calls are never dispatched', async () => {
  for (const functionCall of [
    { name: 'run_shell', args: {} },
    { name: 'replan_day', args: { message: 'Replan', extra: 'injected' } },
  ]) {
    await assert.rejects(async () => {
      for await (const _chunk of streamGemmaConversation(
        { messages: [{ role: 'user', content: 'Replan' }] },
        {
          apiKey: 'test',
          model: 'gemma-4-26b-a4b-it',
          fetcher: async () => googleStream([{ functionCall }]),
        },
        new AbortController().signal,
      )) {
        /* consume */
      }
    }, /invalid/);
  }
});

test('voice replan applies only a valid result, reports actual before/after times and stores undo', async () => {
  let workspace = freshWorkspace();
  const original = structuredClone(workspace);
  const outcome = await executeVoiceReplan("I'm only around from 14:00.", {
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
    outcome.changes?.find((item) => item.title === 'Study marketing')?.after ??
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
    const result = await executeVoiceReplan('Replan my day.', {
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
              result: { ...proposal.result, status: 'conflict', summary: 'Not enough time.' },
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
    fetcher: async () => googleStream([{ text: 'Your study block now starts at 14:00.' }]),
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
      body: JSON.stringify({ messages: [{ role: 'user', content: 'What changed?' }] }),
    });
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /14:00/);
    assert.match(text, /data: \[DONE\]/);
    assert.doesNotMatch(text, /test-gemma-key|test-eleven-key|test-bridge-secret/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
