import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReplanRequest } from '../shared/contracts';
import { demoCheckIn, demoPlan } from '../shared/demo';
import { measureBlocks, selectMeasures, type EnergyMeasures } from '../shared/measures';
import { generatePlan } from '../server/gemma';

const request = (patch: Partial<ReplanRequest['checkIn']> = {}): ReplanRequest =>
  structuredClone({
    plan: demoPlan,
    checkIn: { ...demoCheckIn, ...patch },
    message: 'I slept badly.',
  });
const ids = (measures: EnergyMeasures) => ({
  actions: measures.actions.map((item) => item.id),
  restrictions: measures.restrictions.map((item) => item.id),
});

test('measure IDs are unique and blocked IDs exist', () => {
  const known = new Set(measureBlocks.map((block) => block.id));
  assert.equal(known.size, measureBlocks.length);
  for (const block of measureBlocks)
    for (const id of block.blocks ?? []) assert.ok(known.has(id), `${block.id} → ${id}`);
});

test('no measures after enough sleep and without low energy', () => {
  assert.deepEqual(selectMeasures(request(), { energy: 'medium', sleepHours: 7.5 }), {
    actions: [],
    restrictions: [],
  });
});

test('demo day: late start, priorities first, no caffeine or running when excluded', () => {
  const result = selectMeasures(request(), { energy: 'medium', sleepHours: 6.5 });
  assert.deepEqual(ids(result), {
    actions: ['SPAET_WICHTIGE_AUFGABE', 'AUF_SPAZIEREN', 'SPAET_PRIORISIEREN'],
    restrictions: ['SPAET_KEIN_NACHHOLEN'],
  });
  const all = [...result.actions, ...result.restrictions].map((item) => item.id);
  assert.equal(
    all.some((id) => id.startsWith('KOF_') || id === 'NAP_KOFFEIN' || id === 'BEW_JOGGEN'),
    false,
  );
});

test('sleepy with severe sleep loss: core nap and walk, no intense training', () => {
  const result = ids(
    selectMeasures(
      request({ exclusions: [] }),
      { energy: 'low', sleepHours: 4.5 },
      { schlaefrig: true },
    ),
  );
  assert.ok(result.actions.includes('NAP_KURZ'));
  assert.ok(result.actions.includes('BEW_ENERGIETIEF'));
  assert.ok(result.restrictions.includes('BEW_KEIN_HIIT'));
});

test('microsleep blocks caffeine even when caffeine would otherwise fit', () => {
  const result = ids(
    selectMeasures(
      request({ exclusions: [] }),
      { energy: 'low', sleepHours: 5 },
      { sekundenschlaf: true, koffeinHeuteMg: 0, trinktRegelmaessigKaffee: true },
    ),
  );
  assert.equal(result.actions.includes('KOF_ERSTE_DOSIS'), false);
  assert.equal(result.actions.includes('NAP_KOFFEIN'), false);
  assert.ok(result.restrictions.includes('KOF_NICHT_UEBERDECKEN'));
});

test('caffeine respects the daily maximum and the cutoff before bedtime', () => {
  const capped = ids(
    selectMeasures(
      request({ exclusions: [] }),
      { energy: 'low', sleepHours: 5 },
      { koffeinHeuteMg: 380 },
    ),
  );
  assert.equal(capped.actions.includes('KOF_NACHDOSIS'), false);
  assert.ok(capped.restrictions.includes('KOF_TAGESMAXIMUM'));

  const late = request({ exclusions: [] });
  late.plan.now = 900;
  const evening = ids(
    selectMeasures(late, { energy: 'low', sleepHours: 5 }, { schlaefrig: true, koffeinHeuteMg: 0 }),
  );
  assert.equal(evening.actions.includes('KOF_ERSTE_DOSIS'), false);
  assert.equal(evening.actions.includes('NAP_KURZ'), false);
  assert.ok(evening.restrictions.includes('KOF_CUTOFF'));
});

test('the Gemma adapter returns engine-selected measures from the reported signals', async () => {
  const source = request();
  source.message = 'I only slept five hours and have little energy. I keep nodding off.';
  const response = await generatePlan(source, {
    apiKey: 'test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'update_day_context',
                      args: {
                        energy: 'low',
                        sleepHours: 5,
                        source: source.message,
                      },
                    },
                  },
                  {
                    functionCall: {
                      name: 'update_day_context',
                      args: { signals: { sekundenschlaf: true }, source: 'I keep nodding off.' },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  });
  assert.ok(response.measures.restrictions.some((item) => item.id === 'KOF_NICHT_UEBERDECKEN'));
  assert.ok(response.measures.actions.length > 0);
});

test('nap advice follows the proposed plan, not the replaced one', async () => {
  const state = { energy: 'low' as const, sleepHours: 5 };
  const source = request();
  source.message =
    'I slept five hours, I’m sleepy and have little energy. Please move statistics study up to 1 pm.';
  const before = ids(selectMeasures(source, state, { schlaefrig: true }));
  assert.ok(before.actions.includes('NAP_KURZ'));
  const response = await generatePlan(source, {
    apiKey: 'test',
    model: 'gemma-4-26b-a4b-it',
    fetcher: async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'update_day_context',
                      args: {
                        ...state,
                        signals: { schlaefrig: true },
                        source: 'I slept five hours, I’m sleepy and have little energy.',
                      },
                    },
                  },
                  {
                    functionCall: {
                      name: 'move_task',
                      args: {
                        id: 'study',
                        start: 780,
                        shiftMinutes: null,
                        source: 'move statistics study up to 1 pm',
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  });
  assert.equal(response.proposedPlan?.items.find((item) => item.id === 'study')?.start, 780);
  assert.equal(
    response.measures.actions.some((item) => item.id === 'NAP_KURZ'),
    false,
  );
});
