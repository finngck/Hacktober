import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app';
import { prepareToolCalls } from '../server/planner-tools';
import { scheduleFromIntent } from '../server/scheduler';
import { continueConversation } from '../shared/conversation';
import { demoCheckIn, demoPlan } from '../shared/demo';
import {
  replanRequestSchema,
  replanResponseSchema,
  validatePlan,
  type ReplanRequest,
} from '../shared/contracts';

const request = (): ReplanRequest =>
  structuredClone({
    plan: demoPlan,
    checkIn: demoCheckIn,
    message: 'Ich habe keinen Kopf mehr für Statistik und will das länger machen.',
  });
const resize = (source: ReplanRequest, id = 'study', changeMinutes?: number) => ({
  name: 'adjust_task_duration',
  args: { id, changeMinutes, source: source.message },
});
const schedule = (source: ReplanRequest, calls: unknown[]) => {
  const prepared = prepareToolCalls(source, calls);
  return scheduleFromIntent(prepared.request, prepared.intent, source.plan);
};

test('more time defaults to a real 30-minute extension and combines with low energy', () => {
  const source = request();
  const snapshot = structuredClone(source);
  const response = schedule(source, [
    resize(source),
    { name: 'update_day_context', args: { energy: 'low', source: 'keinen Kopf mehr' } },
  ]);
  assert.equal(response.result.status, 'proposal');
  assert.equal(response.result.energy, 'low');
  assert.equal(response.proposedPlan!.items.find((item) => item.id === 'study')!.duration, 120);
  assert.equal(response.proposedPlan!.items.find((item) => item.id === 'project')!.start, null);
  assert.deepEqual(validatePlan(response.proposedPlan!), []);
  assert.deepEqual(source, snapshot);
});

test('running work can be extended; its start and elapsed work remain while following tasks shift', () => {
  const source = request();
  source.plan.now = 840;
  source.plan.availableFrom = 840;
  source.plan.items.push({
    ...source.plan.items.find((item) => item.id === 'inbox')!,
    id: 'follow-up',
    title: 'Kurze Nachbereitung',
    start: 900,
    duration: 15,
  });
  const response = schedule(source, [resize(source, 'study', 30)]);
  const study = response.proposedPlan!.items.find((item) => item.id === 'study')!;
  assert.equal(study.start, 810);
  assert.equal(study.duration, 120);
  assert.notEqual(response.proposedPlan!.items.find((item) => item.id === 'follow-up')!.start, 900);
  assert.deepEqual(
    response.proposedPlan!.items.filter((item) => item.fixed),
    source.plan.items.filter((item) => item.fixed),
  );
  assert.match(
    response.result.placements.find((item) => item.id === 'study')!.reason,
    /120 Minuten/,
  );
  assert.deepEqual(validatePlan(response.proposedPlan!), []);
});

test('absolute running duration is supported but cannot rewrite elapsed work or other fields', () => {
  const source = request();
  source.plan.now = 840;
  source.plan.availableFrom = 840;
  const update = (patch: object) => ({
    name: 'update_task',
    args: { id: 'study', patch, source: source.message },
  });
  const response = schedule(source, [update({ duration: 120 })]);
  assert.equal(response.proposedPlan!.items.find((item) => item.id === 'study')!.start, 810);
  for (const patch of [{ duration: 20 }, { duration: 120, title: 'Andere Aufgabe' }]) {
    assert.throws(() => prepareToolCalls(source, [update(patch)]));
  }
  assert.throws(() => prepareToolCalls(source, [resize(source, 'study', -80)]));
});

test('relative duration edits reject no-ops, invalid totals, duplicates, fixed and completed tasks atomically', () => {
  const source = request();
  const snapshot = structuredClone(source);
  for (const call of [
    resize(source, 'study', 0),
    resize(source, 'study', -90),
    resize(source, 'study', 480),
    resize(source, 'missing', 30),
    resize(source, 'team', 30),
    resize(source, 'lunch', 30),
    { name: 'update_task', args: { id: 'study', patch: { duration: 90 }, source: source.message } },
  ]) {
    assert.throws(() => prepareToolCalls(source, [call]));
    assert.deepEqual(source, snapshot);
  }
  assert.throws(() => prepareToolCalls(source, [resize(source), resize(source)]));
  assert.deepEqual(source, snapshot);
});

test('a running extension that hits a fixed event or deadline reports a conflict', () => {
  const source = request();
  source.plan.now = 840;
  source.plan.availableFrom = 840;
  for (const extra of [60, 240]) {
    const response = schedule(source, [resize(source, 'study', extra)]);
    assert.equal(response.result.status, 'conflict');
    assert.equal(response.proposedPlan, null);
    assert.match(response.result.summary, /überschneiden|Frist|Tagesende/);
  }
});

test('an HTTP clarification followed by just the task name retains the original duration and energy request', async () => {
  const source = request();
  source.message = 'Ich habe keinen Kopf mehr dafür und will lieber länger machen.';
  let calls = 0;
  const app = createApp({
    apiKey: 'synthetic-test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const payload = JSON.parse(body.contents[0].parts[0].text);
      calls++;
      const tools =
        calls === 1
          ? [{ name: 'ask_clarification', args: { question: 'Welche Aufgabe meinst du?' } }]
          : [
              {
                name: 'adjust_task_duration',
                args: { id: 'study', source: 'will lieber länger machen' },
              },
              { name: 'update_day_context', args: { energy: 'low', source: 'keinen Kopf mehr' } },
            ];
      if (calls === 2) {
        assert.equal(payload.latestMessage, 'Statistik');
        assert.ok(payload.message.includes(source.message));
        assert.ok(payload.message.endsWith('Statistik'));
        assert.equal(payload.conversation[0].message, source.message);
        assert.equal(payload.conversation[0].reply, 'Welche Aufgabe meinst du?');
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: tools.map((functionCall) => ({ functionCall })) } }],
        }),
      );
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const post = async (body: ReplanRequest) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/replan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return replanResponseSchema.parse(await response.json());
  };
  try {
    const question = await post(source);
    assert.equal(question.result.status, 'clarification');
    const conversation = continueConversation(source, question);
    const answer = await post({ ...source, message: 'Statistik', conversation });
    assert.equal(answer.result.status, 'proposal');
    assert.equal(answer.result.energy, 'low');
    assert.equal(answer.proposedPlan!.items.find((item) => item.id === 'study')!.duration, 120);
    assert.deepEqual(continueConversation({ message: 'Statistik', conversation }, answer), []);
    assert.equal(calls, 2);
    let repeated = conversation;
    for (let index = 0; index < 5; index++)
      repeated = continueConversation(
        { message: `Antwort ${index}`, conversation: repeated },
        question,
      );
    assert.equal(repeated.length, 4);
    assert.equal(repeated[0].message, source.message);
    assert.equal(repeated.at(-1)!.message, 'Antwort 4');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('assistant replies cannot authorize edits; short answers and bounded user context can', () => {
  const source = request();
  source.conversation = [{ message: source.message, reply: 'Soll ich das Gym auslassen?' }];
  source.message = 'Ja';
  assert.equal(replanRequestSchema.safeParse(source).success, true);
  assert.throws(
    () =>
      prepareToolCalls(source, [
        { name: 'defer_tasks', args: { ids: ['gym'], source: 'Gym auslassen' } },
      ]),
    /Nutzernachricht/,
  );
  assert.doesNotThrow(() =>
    prepareToolCalls(source, [
      { name: 'adjust_task_duration', args: { id: 'study', source: 'will das länger machen' } },
    ]),
  );
  assert.equal(
    replanRequestSchema.safeParse({
      ...source,
      conversation: Array(5).fill(source.conversation[0]),
    }).success,
    false,
  );
});
