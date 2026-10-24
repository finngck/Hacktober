import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkInSchema,
  materializeProposal,
  hasItemChanged,
  replanResponseSchema,
  validatePlan,
  type ModelResult,
  type ReplanRequest,
} from '../shared/contracts';
import { demoCheckIn, demoPlan } from '../shared/demo';
import { generatePlan, parseToolResponse } from '../server/gemma';
import { scheduleFromIntent, type PlanningIntent } from '../server/scheduler';
import { plannerToolDeclarations, prepareToolCalls } from '../server/planner-tools';

const request = (): ReplanRequest =>
  structuredClone({
    plan: demoPlan,
    checkIn: demoCheckIn,
    message: 'Ich bin ab 14 Uhr verfügbar, habe nur fünf Stunden geschlafen und wenig Energie.',
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
const toolCalls = () => [
  {
    name: 'update_day_context',
    args: { availabilityFrom: 840, energy: 'low', sleepHours: 5, source: request().message },
  },
];
const providerResponse = (calls: unknown) =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: Array.isArray(calls)
              ? calls.map((functionCall) => ({ functionCall }))
              : [{ text: JSON.stringify(calls) }],
          },
        },
      ],
    }),
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

test('accepts native calls only, never free text plans or JSON masquerading as tools', async () => {
  const data = await providerResponse(toolCalls()).json();
  assert.deepEqual(parseToolResponse(data), toolCalls());
  assert.throws(
    () =>
      parseToolResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(intent()) }] } }],
      }),
    /native/,
  );
  assert.throws(() => parseToolResponse({}));
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
      const body = JSON.parse(String(init?.body));
      assert.equal(body.toolConfig.functionCallingConfig.mode, 'ANY');
      assert.deepEqual(body.tools[0].functionDeclarations, plannerToolDeclarations);
      assert.ok(
        body.tools[0].functionDeclarations.some(
          (tool: { name: string }) => tool.name === 'create_task',
        ),
      );
      return providerResponse(toolCalls());
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
        return providerResponse([
          { name: 'update_day_context', args: { ...toolCalls()[0].args, availabilityFrom: -1 } },
        ]);
      }
      return providerResponse(toolCalls());
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

test('transient provider failures share the same two-attempt budget and never expose provider bodies', async () => {
  let calls = 0;
  const response = await generatePlan(request(), {
    apiKey: 'test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () =>
      ++calls === 1
        ? new Response('DO NOT EXPOSE provider-details', { status: 500 })
        : providerResponse(toolCalls()),
  });
  assert.equal(response.meta.attempts, 2);
  calls = 0;
  await assert.rejects(
    generatePlan(request(), {
      apiKey: 'test',
      model: 'gemma-4-26b-a4b-it',
      fetcher: async () => {
        calls++;
        return new Response('DO NOT EXPOSE provider-details', { status: 503 });
      },
    }),
    /vorübergehenden Fehler/,
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
    fetcher: async () =>
      providerResponse([
        { name: 'update_day_context', args: { ...toolCalls()[0].args, availabilityFrom: 1080 } },
      ]),
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

const marketingRequest = (): ReplanRequest => ({
  ...request(),
  message:
    'Ich schreib morgen noch eine marketing Klausur und muss noch lernen kannst du das einplanen und irrelevante sachen austauschen',
});
const createMarketing = () => ({
  name: 'create_task',
  args: {
    id: 'new-marketing',
    brick: 'exam_prep',
    title: 'Für die Marketing-Klausur lernen',
    source: 'morgen noch eine marketing Klausur und muss noch lernen',
  },
});

test('screenshot regression: new Marketing prep is actually scheduled, Statistics and all existing tasks survive', async () => {
  const source = marketingRequest();
  const unchanged = structuredClone(source);
  const response = await generatePlan(source, {
    apiKey: 'synthetic',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () => providerResponse([createMarketing()]),
  });
  replanResponseSchema.parse(response);
  const plan = response.proposedPlan!;
  assert.equal(response.result.status, 'proposal');
  const marketing = plan.items.find((item) => item.id === 'new-marketing')!;
  assert.notEqual(marketing.start, null);
  assert.equal(marketing.duration, 90);
  assert.equal(marketing.deadline, null); // tomorrow's exam is not a fabricated deadline today
  assert.equal(marketing.priority, 'high');
  assert.equal(plan.items.length, source.plan.items.length + 1);
  assert.equal(
    plan.items.find((item) => item.id === 'study')?.title,
    'Für die Statistik-Klausur lernen',
  );
  assert.notEqual(plan.items.find((item) => item.id === 'study')?.start, null);
  for (const item of source.plan.items) {
    assert.ok(plan.items.some((after) => after.id === item.id));
    if (item.fixed || item.start! < source.plan.now)
      assert.deepEqual(
        plan.items.find((after) => after.id === item.id),
        item,
      );
  }
  assert.equal(
    plan.items.find((item) => item.id === 'gym')?.start,
    source.plan.items.find((item) => item.id === 'gym')?.start,
  );
  assert.equal(
    plan.items.find((item) => item.id === 'inbox')?.start,
    source.plan.items.find((item) => item.id === 'inbox')?.start,
  );
  assert.match(response.result.summary, /Neu eingeplant: „Für die Marketing/);
  assert.deepEqual(validatePlan(plan), []);
  assert.deepEqual(source, unchanged);
});

test('editing existing Marketing prep preserves identity and is visible even without a time change', () => {
  const source = marketingRequest();
  source.message = 'Bitte die Marketing-Lernzeit auf 60 Minuten kürzen.';
  const marketing = source.plan.items.find((item) => item.id === 'study')!;
  marketing.title = 'Für die Marketing-Klausur lernen';
  const prepared = prepareToolCalls(source, [
    {
      name: 'update_task',
      args: {
        id: 'study',
        patch: { duration: 60 },
        source: 'Marketing-Lernzeit auf 60 Minuten kürzen',
      },
    },
  ]);
  const response = scheduleFromIntent(prepared.request, prepared.intent, source.plan);
  const after = response.proposedPlan!.items.find((item) => item.id === 'study')!;
  assert.equal(response.proposedPlan!.items.length, source.plan.items.length);
  assert.equal(after.id, marketing.id);
  assert.equal(after.start, marketing.start);
  assert.equal(after.duration, 60);
  assert.equal(after.title, marketing.title);
  assert.ok(hasItemChanged(marketing, after));
  assert.match(response.result.summary, /Bearbeitet und eingeplant/);
  assert.match(
    response.result.placements.find((item) => item.id === 'study')!.reason,
    /60 Minuten/,
  );
});

test('unknown tools, forged fields, unsupported edits, invented evidence and duplicate tasks fail atomically', () => {
  const source = marketingRequest();
  const snapshot = structuredClone(source);
  for (const invalid of [
    { name: 'delete_task', args: { id: 'study' } },
    { name: 'create_task', args: { ...createMarketing().args, start: 1005 } },
    { name: 'create_task', args: { ...createMarketing().args, source: 'invented' } },
    { name: 'create_task', args: { ...createMarketing().args, id: 'study' } },
    {
      name: 'update_task',
      args: { id: 'missing', patch: { duration: 60 }, source: source.message },
    },
    { name: 'update_task', args: { id: 'team', patch: { duration: 30 }, source: source.message } },
    {
      name: 'update_task',
      args: { id: 'lunch', patch: { title: 'New lunch' }, source: source.message },
    },
    {
      name: 'update_task',
      args: { id: 'study', patch: { deadline: null }, source: source.message },
    },
    { name: 'update_task', args: { id: 'study', patch: { fixed: false }, source: source.message } },
    { name: 'update_task', args: { id: 'study', patch: {}, source: source.message } },
    { name: 'defer_tasks', args: { ids: ['study'], source: source.message } },
  ]) {
    assert.throws(() => prepareToolCalls(source, [createMarketing(), invalid]));
    assert.deepEqual(source, snapshot);
  }
  assert.throws(() => prepareToolCalls(source, [createMarketing(), createMarketing()]));
  assert.throws(() =>
    prepareToolCalls(source, [
      createMarketing(),
      { name: 'defer_tasks', args: { ids: ['new-marketing'], source: source.message } },
    ]),
  );
});

test('requested prep survives low energy, but impossible time or exclusions produce a conflict without a fake proposal', () => {
  const source = marketingRequest();
  source.checkIn.energy = 'low';
  const prepared = prepareToolCalls(source, [createMarketing()]);
  const result = scheduleFromIntent(prepared.request, prepared.intent, source.plan);
  assert.notEqual(
    result.proposedPlan!.items.find((item) => item.id === 'new-marketing')?.start,
    null,
  );
  const impossible = prepareToolCalls(source, [
    { ...createMarketing(), args: { ...createMarketing().args, duration: 480 } },
  ]);
  const failed = scheduleFromIntent(impossible.request, impossible.intent, source.plan);
  assert.equal(failed.result.status, 'conflict');
  assert.equal(failed.proposedPlan, null);
  assert.match(failed.result.summary, /Marketing/);
  source.checkIn.exclusions.push('gym');
  const excluded = prepareToolCalls(source, [
    {
      name: 'create_task',
      args: {
        ...createMarketing().args,
        id: 'new-gym',
        brick: 'gym',
        title: 'Gym',
      },
    },
  ]);
  assert.equal(
    scheduleFromIntent(excluded.request, excluded.intent, source.plan).result.status,
    'conflict',
  );
});

test('priority references resolve new tasks regardless of batch order; clarification cannot mutate a plan', () => {
  const source = marketingRequest();
  const prepared = prepareToolCalls(source, [
    { name: 'prioritize_tasks', args: { ids: ['new-marketing'], source: source.message } },
    createMarketing(),
  ]);
  assert.deepEqual(prepared.intent.focusIds, ['new-marketing']);
  const question = {
    name: 'ask_clarification',
    args: { question: 'Welche Lernaufgabe meinst du?' },
  };
  assert.throws(() => prepareToolCalls(source, [question, createMarketing()]));
  const clarification = prepareToolCalls(source, [question]);
  const response = scheduleFromIntent(clarification.request, clarification.intent, source.plan);
  assert.equal(response.result.status, 'clarification');
  assert.equal(response.proposedPlan, null);
});

test('untrusted model prose is ignored and displayed summary comes only from applied tools', async () => {
  const data = await providerResponse([{ name: 'replan_day', args: {} }]).json();
  data.candidates[0].content.parts.unshift({
    text: 'Marketing ist jetzt eingeplant, Projekt und Gym sind morgen.',
  });
  const response = await generatePlan(marketingRequest(), {
    apiKey: 'test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () => new Response(JSON.stringify(data)),
  });
  assert.doesNotMatch(response.result.summary, /Marketing|morgen/);
  assert.equal(response.proposedPlan!.items.length, demoPlan.items.length);
});

test('fixed appointments stay put unless the user explicitly asks to move them', () => {
  const source = request();
  const kept = scheduleFromIntent(source, intent());
  assert.equal(kept.proposedPlan?.items.find((item) => item.id === 'team')?.start, 930);

  const moved = scheduleFromIntent(source, {
    ...intent(),
    moves: [{ id: 'team', start: null, shiftMinutes: -15 }],
  });
  const team = moved.proposedPlan?.items.find((item) => item.id === 'team');
  assert.equal(moved.result.status, 'proposal');
  assert.equal(team?.start, 915);
  assert.equal(team?.fixed, true);
  assert.deepEqual(validatePlan(moved.proposedPlan!), []);
  assert.match(moved.result.placements.find((item) => item.id === 'team')!.reason, /Wunsch/);
});

test('explicit moves accept absolute times and report clear conflicts', () => {
  const source = request();
  const absolute = scheduleFromIntent(source, {
    ...intent(),
    moves: [{ id: 'team', start: 900, shiftMinutes: null }],
  });
  assert.equal(absolute.proposedPlan?.items.find((item) => item.id === 'team')?.start, 900);

  const outside = scheduleFromIntent(source, {
    ...intent(),
    moves: [{ id: 'team', start: 1430, shiftMinutes: null }],
  });
  assert.equal(outside.result.status, 'conflict');
  assert.equal(outside.proposedPlan, null);

  const overlap = scheduleFromIntent(source, {
    ...intent(),
    moves: [{ id: 'team', start: 1150, shiftMinutes: null }],
  });
  assert.equal(overlap.result.status, 'conflict');
  assert.match(overlap.result.summary, /überschneiden/);
});

test('past or begun tasks cannot be moved even on request', () => {
  const source = request();
  const begun = source.plan.items.find(
    (item) => item.start !== null && item.start < source.plan.now,
  )!;
  const outcome = scheduleFromIntent(source, {
    ...intent(),
    moves: [{ id: begun.id, start: source.plan.now + 60, shiftMinutes: null }],
  });
  assert.equal(outcome.result.status, 'conflict');
});

test('native move tool preserves explicit fixed-appointment moves together with Marketing prep', async () => {
  const source = marketingRequest();
  source.message += '. Bitte das Team-Meeting 15 Minuten früher.';
  const move = {
    name: 'move_task',
    args: {
      id: 'team',
      start: null,
      shiftMinutes: -15,
      source: 'Team-Meeting 15 Minuten früher',
    },
  };
  const response = await generatePlan(source, {
    apiKey: 'test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () => providerResponse([createMarketing(), move]),
  });
  assert.equal(response.result.status, 'proposal');
  assert.equal(response.proposedPlan!.items.find((item) => item.id === 'team')?.start, 915);
  assert.equal(response.proposedPlan!.items.find((item) => item.id === 'team')?.fixed, true);
  assert.notEqual(
    response.proposedPlan!.items.find((item) => item.id === 'new-marketing')?.start,
    null,
  );
  assert.equal(source.plan.items.find((item) => item.id === 'team')?.start, 930);
  for (const invalid of [
    { ...move, args: { ...move.args, start: 900 } },
    { ...move, args: { ...move.args, shiftMinutes: null } },
    { ...move, args: { ...move.args, id: 'missing' } },
    { ...move, args: { ...move.args, id: 'lunch' } },
    { ...move, args: { ...move.args, source: 'invented' } },
  ])
    assert.throws(() => prepareToolCalls(source, [invalid]));
  assert.throws(() => prepareToolCalls(source, [move, move]));
});

test('context tools merge compatible fields atomically and reject contradictory values', () => {
  const source = request();
  const context = (args: object) => ({
    name: 'update_day_context',
    args: { ...args, source: source.message },
  });
  const prepared = prepareToolCalls(source, [
    context({ energy: 'low' }),
    context({ sleepHours: 5 }),
    context({ energy: 'low' }),
  ]);
  assert.equal(prepared.intent.energy, 'low');
  assert.equal(prepared.intent.sleepHours, 5);
  assert.throws(
    () => prepareToolCalls(source, [context({ energy: 'low' }), context({ energy: 'high' })]),
    /Widersprüchliche/,
  );
  assert.throws(
    () =>
      prepareToolCalls(source, [
        context({ signals: { schlaefrig: true } }),
        context({ signals: { schlaefrig: false } }),
      ]),
    /Widersprüchliche/,
  );
});

test('the check-in focus task is planned and not deferred, even at low energy', () => {
  const source = request();
  source.checkIn.focusTaskId = 'project';
  const scheduled = scheduleFromIntent(source, { ...intent(), deferIds: [] });
  assert.ok(scheduled.proposedPlan);
  assert.deepEqual(validatePlan(scheduled.proposedPlan), []);
  assert.notEqual(scheduled.proposedPlan.items.find((item) => item.id === 'project')?.start, null);
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
