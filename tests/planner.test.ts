import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkInSchema,
  materializeProposal,
  validatePlan,
  type ModelResult,
  type ReplanRequest,
} from '../shared/contracts';
import { demoCheckIn, demoPlan } from '../shared/demo';
import { generatePlan, parseModelText } from '../server/gemma';
import { scheduleFromIntent, type PlanningIntent } from '../server/scheduler';

const request = (): ReplanRequest =>
  structuredClone({
    plan: demoPlan,
    checkIn: demoCheckIn,
    message: 'Ich bin ab 14 Uhr verfügbar und habe wenig Energie.',
  });
const result = (): ModelResult => ({
  status: 'proposal',
  summary: 'Lernen später, Projekt bleibt offen.',
  availabilityFrom: 840,
  energy: 'low',
  sleepHours: 5,
  question: null,
  placements: demoPlan.items.map((item) => ({
    id: item.id,
    start: item.id === 'study' ? 840 : item.id === 'project' ? null : item.start,
    reason: 'An den veränderten Tag angepasst.',
  })),
});
const intent = (): PlanningIntent => ({
  status: 'ready',
  summary: 'Lernen und Erholung haben heute Vorrang.',
  availabilityFrom: 840,
  energy: 'low',
  sleepHours: 5,
  question: null,
  taskOrder: ['study', 'break', 'inbox', 'project', 'gym'],
  deferIds: ['project', 'gym'],
  reasons: [{ id: 'project', reason: 'Heute weniger anspruchsvolle Arbeit einplanen.' }],
});
const providerResponse = (body: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

test('valid proposal preserves task identity, duration and fixed events while keeping deferred work visible', () => {
  const source = request();
  const plan = materializeProposal(source, result());
  assert.deepEqual(validatePlan(plan), []);
  assert.equal(plan.availableFrom, 840);
  assert.equal(plan.items.find((item) => item.id === 'study')?.start, 840);
  assert.equal(plan.items.find((item) => item.id === 'project')?.start, null);
  assert.deepEqual(
    plan.items.filter((item) => item.fixed),
    source.plan.items.filter((item) => item.fixed),
  );
  assert.deepEqual(
    plan.items.map((item) => [item.id, item.duration]),
    source.plan.items.map((item) => [item.id, item.duration]),
  );
  assert.equal(source.plan.items.find((item) => item.id === 'study')?.start, 810);
});

test('rejects fixed and past events moving, disappearing IDs, duplicates and invented tasks', () => {
  for (const id of ['team', 'lunch']) {
    const changed = result();
    changed.placements.find((item) => item.id === id)!.start = 900;
    assert.throws(() => materializeProposal(request(), changed), /darf nicht verschoben/);
  }
  const missing = result();
  missing.placements.pop();
  assert.throws(() => materializeProposal(request(), missing), /genau einmal/);
  const duplicate = result();
  duplicate.placements[1] = duplicate.placements[0];
  assert.throws(() => materializeProposal(request(), duplicate), /Doppelte/);
  const invented = result();
  invented.placements[0].id = 'invented';
  assert.throws(() => materializeProposal(request(), invented), /genau einmal/);
});

test('rejects overlaps, scheduling before availability, day overrun, and missed deadlines', () => {
  for (const [id, start, pattern] of [
    ['study', 900, /überschneiden/],
    ['study', 810, /Verfügbarkeit/],
    ['inbox', 1280, /Tagesrahmen/],
    ['study', 1050, /Frist/],
    ['study', null, /Frist/],
  ] as const) {
    const changed = result();
    changed.placements.find((item) => item.id === id)!.start = start;
    assert.throws(() => materializeProposal(request(), changed), pattern);
  }
});

test('hard exclusions require a conflicting flexible activity to stay unplanned', () => {
  const source = request();
  source.checkIn.exclusions.push('gym');
  assert.throws(() => materializeProposal(source, result()), /Ausschluss/);
  const changed = result();
  changed.placements.find((item) => item.id === 'gym')!.start = null;
  assert.doesNotThrow(() => materializeProposal(source, changed));
});

test('low-energy replanning preserves existing recovery breaks', () => {
  const changed = result();
  changed.placements.find((item) => item.id === 'break')!.start = null;
  assert.throws(() => materializeProposal(request(), changed), /Erholungspause/);
});

test('invalid original schedules cannot be accepted, including fixed events with no start', () => {
  const source = request();
  source.plan.items[0].start = 810;
  assert.match(validatePlan(source.plan).join(' '), /überschneiden/);
  source.plan.items.find((item) => item.id === 'team')!.start = null;
  assert.match(validatePlan(source.plan).join(' '), /fester Termin/);
});

test('parses fenced JSON, rejects malformed model data', () => {
  assert.equal(parseModelText('```json\n' + JSON.stringify(intent()) + '\n```').status, 'ready');
  assert.throws(() => parseModelText('{"status":"proposal"}'));
  assert.throws(() => parseModelText('not json'));
});

test('live adapter uses the Gemma endpoint and header; returns only validated output', async () => {
  let calls = 0;
  const response = await generatePlan(request(), {
    apiKey: 'synthetic-test-key',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async (url, init) => {
      calls++;
      assert.match(String(url), /gemma-4-26b-a4b-it:generateContent$/);
      assert.equal(
        (init?.headers as Record<string, string>)['x-goog-api-key'],
        'synthetic-test-key',
      );
      assert.equal(String(init?.body).includes('synthetic-test-key'), false);
      return providerResponse(intent());
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.proposedPlan?.items.find((item) => item.id === 'study')?.start, 840);
  assert.equal(response.meta.attempts, 1);
  assert.equal(JSON.stringify(response).includes('synthetic-test-key'), false);
});

test('invalid plans get one repair attempt, never a fabricated fallback', async () => {
  let calls = 0;
  const response = await generatePlan(request(), {
    apiKey: 'test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () => {
      calls++;
      if (calls === 1) {
        const invalid = { ...intent(), availabilityFrom: -1 };
        return providerResponse(invalid);
      }
      return providerResponse(intent());
    },
  });
  assert.equal(calls, 2);
  assert.equal(response.meta.attempts, 2);
  calls = 0;
  await assert.rejects(
    generatePlan(request(), {
      apiKey: 'test',
      model: 'gemma-4-26b-a4b-it',
      fetcher: async () => {
        calls++;
        return providerResponse({ bad: 'output' });
      },
    }),
    /zwei Versuchen/,
  );
  assert.equal(calls, 2);
});

test('the scheduler preserves recovery and commitments, defers heavy work, and detects actual conflicts', () => {
  const scheduled = scheduleFromIntent(request(), intent());
  assert.ok(scheduled.proposedPlan);
  assert.deepEqual(validatePlan(scheduled.proposedPlan), []);
  assert.equal(scheduled.proposedPlan.items.find((item) => item.id === 'study')?.start, 840);
  assert.equal(scheduled.proposedPlan.items.find((item) => item.id === 'break')?.start, 990);
  assert.equal(scheduled.proposedPlan.items.find((item) => item.id === 'project')?.start, null);
  assert.equal(scheduled.proposedPlan.items.find((item) => item.id === 'gym')?.start, null);
  assert.equal(scheduled.proposedPlan.items.find((item) => item.id === 'inbox')?.start, 1245);
  const impossible = scheduleFromIntent(request(), { ...intent(), availabilityFrom: 1080 });
  assert.equal(impossible.result.status, 'conflict');
  assert.equal(impossible.proposedPlan, null);
  assert.match(impossible.result.summary, /Team-Meeting/);
  const question = scheduleFromIntent(request(), {
    ...intent(),
    status: 'clarification',
    question: 'Ab wann bist du verfügbar?',
  });
  assert.equal(question.proposedPlan, null);
  assert.equal(question.result.question, 'Ab wann bist du verfügbar?');
});

test('scheduler honors exclusions and model priorities while keeping deadline work mandatory', () => {
  const source = request();
  source.checkIn.exclusions.push('gym');
  const scheduled = scheduleFromIntent(source, {
    ...intent(),
    energy: 'high',
    deferIds: ['study', 'break'],
    taskOrder: ['gym', 'project', 'inbox'],
  });
  assert.ok(scheduled.proposedPlan);
  assert.equal(scheduled.proposedPlan.items.find((item) => item.id === 'gym')?.start, null);
  assert.equal(scheduled.proposedPlan.items.find((item) => item.id === 'study')?.start, 840);
  assert.notEqual(scheduled.proposedPlan.items.find((item) => item.id === 'project')?.start, null);
});

test('conflicts and clarifications cannot be applied; missing key, rate limit and errors are explicit', async () => {
  const conflict = {
    ...result(),
    status: 'conflict' as const,
    availabilityFrom: 1080,
    placements: [],
    summary: 'Ab 18 Uhr kannst du das Meeting um 15:30 nicht erreichen.',
  };
  const response = await generatePlan(request(), {
    apiKey: 'test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () => providerResponse({ ...intent(), availabilityFrom: 1080 }),
  });
  assert.equal(response.proposedPlan, null);
  assert.throws(() => materializeProposal(request(), conflict), /kein Planvorschlag/);
  await assert.rejects(generatePlan(request(), { model: 'gemma-4-26b-a4b-it' }), /API-Key/);
  await assert.rejects(generatePlan(request(), { apiKey: 'test', model: 'gemini-4' }), /Gemma-4/);
  await assert.rejects(
    generatePlan(request(), {
      apiKey: 'test',
      model: 'gemma-4-26b-a4b-it',
      fetcher: async () => new Response('DO NOT EXPOSE test-secret', { status: 429 }),
    }),
    /Gemma-Limit/,
  );
  await assert.rejects(
    generatePlan(request(), {
      apiKey: 'test',
      model: 'gemma-4-26b-a4b-it',
      fetcher: async () => {
        throw new Error('DO NOT EXPOSE test-secret');
      },
    }),
    /nicht erreichbar/,
  );
});

test('the focus task is planned first and not deferred, even at low energy', () => {
  const source = request();
  source.checkIn.focusTaskId = 'project';
  const scheduled = scheduleFromIntent(source, intent());
  assert.ok(scheduled.proposedPlan);
  assert.deepEqual(validatePlan(scheduled.proposedPlan), []);
  const project = scheduled.proposedPlan.items.find((item) => item.id === 'project');
  const inbox = scheduled.proposedPlan.items.find((item) => item.id === 'inbox');
  assert.notEqual(project?.start, null);
  assert.ok(inbox?.start === null || project!.start! < inbox!.start!);
  assert.match(scheduled.result.placements.find((item) => item.id === 'project')!.reason, /Fokus/);
});

test('check-ins saved before mood, stress, sleep quality and focus existed stay valid', () => {
  const legacy = { sleepHours: 7, energy: 'high', productiveTime: 'any', exclusions: [] };
  assert.deepEqual(checkInSchema.parse(legacy), {
    ...legacy,
    sleepQuality: 'okay',
    mood: 3,
    stress: 2,
    focusTaskId: null,
  });
  assert.equal(checkInSchema.safeParse({ ...legacy, mood: 6 }).success, false);
});
