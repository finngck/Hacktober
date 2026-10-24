import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRequestSchema } from '../shared/contracts';
import { createApp } from '../server/app';
import { extractTasks, parseExtractText } from '../server/extract';
import { PlannerError } from '../server/gemma';

const image = { image: 'A'.repeat(200), mimeType: 'image/jpeg' as const };
const task = {
  title: 'Statistik Vorlesung',
  category: 'study',
  duration: 90,
  start: 600,
  deadline: null,
  priority: 'medium',
  fixed: true,
  when: 'Mo 10:00-11:30',
};
const providerResponse = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

test('parses extracted tasks, also when wrapped in a markdown fence', () => {
  const body = JSON.stringify({ tasks: [task], note: null });
  assert.equal(parseExtractText(`\`\`\`json\n${body}\n\`\`\``).tasks[0].title, task.title);
  assert.throws(() => parseExtractText(JSON.stringify({ tasks: [{ ...task, start: 9000 }] })));
});

test('sends the image as inline data and returns reviewable tasks', async () => {
  let sent: any;
  const result = await extractTasks(image, {
    apiKey: 'test-key',
    model: 'gemma-4-test',
    fetcher: async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return providerResponse(JSON.stringify({ tasks: [task], note: null }));
    },
  });
  assert.equal(sent.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
  assert.equal(sent.contents[0].parts[0].inlineData.data, image.image);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.meta.attempts, 1);
});

test('retries once after an invalid answer and then gives up with a clear error', async () => {
  let calls = 0;
  const recovered = await extractTasks(image, {
    apiKey: 'test-key',
    model: 'gemma-4-test',
    fetcher: async () =>
      providerResponse(++calls === 1 ? 'kein json' : JSON.stringify({ tasks: [], note: 'leer' })),
  });
  assert.equal(recovered.meta.attempts, 2);
  await assert.rejects(
    extractTasks(image, {
      apiKey: 'test-key',
      model: 'gemma-4-test',
      fetcher: async () => providerResponse('kein json'),
    }),
    PlannerError,
  );
});

test('requires a configured key and never leaks provider error bodies', async () => {
  await assert.rejects(extractTasks(image, { model: 'gemma-4-test' }), /nicht eingerichtet/);
  await assert.rejects(
    extractTasks(image, {
      apiKey: 'secret-key',
      model: 'gemma-4-test',
      fetcher: async () => new Response('secret-key in body', { status: 400 }),
    }),
    (error: Error) => error instanceof PlannerError && !error.message.includes('secret-key'),
  );
});

test('rejects unsupported or oversized images at the schema and endpoint', async () => {
  assert.equal(extractRequestSchema.safeParse({ ...image, mimeType: 'image/gif' }).success, false);
  assert.equal(
    extractRequestSchema.safeParse({ ...image, image: 'A'.repeat(4_000_000) }).success,
    false,
  );
  const server = createApp({ model: 'gemma-4-test', apiKey: 'k' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'x', mimeType: 'image/png' }),
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});
