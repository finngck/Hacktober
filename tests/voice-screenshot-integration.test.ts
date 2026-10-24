import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app';
import { itemSchema, validatePlan } from '../shared/contracts';
import { freshWorkspace } from '../src/state';
import { executeVoiceReplan } from '../src/voice-tools';

test('voice preserves a large screenshot import and its undo snapshot through the shared API', async () => {
  const image = 'A'.repeat(700_000);
  const extracted = {
    title: 'Importierte Literatur lesen',
    category: 'study',
    duration: 20,
    start: null,
    deadline: null,
    priority: 'medium',
    fixed: false,
    when: null,
  };
  let extractions = 0;
  let replans = 0;
  const app = createApp({
    apiKey: 'synthetic-test-key',
    model: 'gemma-4-test',
    elevenLabsApiKey: 'synthetic-voice-key',
    elevenLabsAgentId: 'synthetic-agent',
    voiceLlmSecret: 'synthetic-secret',
    allowedHosts: ['127.0.0.1'],
    fetcher: async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      const isImage = Boolean(input.contents?.[0]?.parts?.[0]?.inlineData);
      if (isImage) {
        extractions++;
        assert.equal(input.contents[0].parts[0].inlineData.data, image);
      } else {
        replans++;
        assert.ok(
          input.tools[0].functionDeclarations.some(
            (tool: { name: string }) => tool.name === 'create_task',
          ),
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  isImage
                    ? { text: JSON.stringify({ tasks: [extracted], note: null }) }
                    : { functionCall: { name: 'replan_day', args: {} } },
                ],
              },
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const upload = await fetch(`${base}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mimeType: 'image/jpeg' }),
    });
    assert.equal(upload.status, 200, 'The voice parser must not cap screenshot bodies at 512KB');
    const body = await upload.json();
    assert.equal(body.tasks.length, 1);
    const imported = itemSchema.parse({
      ...body.tasks[0],
      id: 'screenshot-imported-task',
      effort: 'medium',
      tags: [],
    });
    let workspace = freshWorkspace();
    workspace.plan.items.push(imported);
    const beforeVoice = structuredClone(workspace);
    const outcome = await executeVoiceReplan('Please replan my day.', {
      read: () => workspace,
      request: async (source, message) => {
        const response = await fetch(`${base}/api/replan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: source.plan, checkIn: source.checkIn, message }),
        });
        assert.equal(response.status, 200);
        return response.json();
      },
      commit: (next) => {
        workspace = next;
      },
      showResult: () => assert.fail('A valid voice replan should apply'),
      signal: new AbortController().signal,
    });
    assert.equal(outcome.status, 'applied');
    assert.equal(extractions, 1);
    assert.equal(replans, 1);
    assert.deepEqual(validatePlan(workspace.plan), []);
    assert.deepEqual(
      workspace.plan.items.map((item) => item.id).toSorted(),
      beforeVoice.plan.items.map((item) => item.id).toSorted(),
    );
    const after = workspace.plan.items.find((item) => item.id === imported.id);
    assert.equal(after?.title, imported.title);
    assert.equal(after?.duration, imported.duration);
    assert.deepEqual(workspace.history.at(-1), {
      plan: beforeVoice.plan,
      checkIn: beforeVoice.checkIn,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
