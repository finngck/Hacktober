import assert from 'node:assert/strict';
import { demoCheckIn, demoPlan, demoPrompts } from '../shared/demo';
import {
  hasItemChanged,
  replanResponseSchema,
  validatePlan,
  type Plan,
  type ReplanRequest,
  type ReplanResponse,
} from '../shared/contracts';
import { config } from '../server/config';
import { generatePlan } from '../server/gemma';
import { setTimeout } from 'node:timers/promises';

// Explicit opt-in: real requests, each with at most one bounded repair.
// Optional scenario names select a subset. REPLAN_BASE_URL checks a deployed API.
const marketingPlan: Plan = structuredClone(demoPlan);
marketingPlan.items.push({
  ...marketingPlan.items.find((item) => item.id === 'study')!,
  id: 'marketing',
  title: 'Für die Marketing-Klausur lernen',
  start: null,
  deadline: null,
});
const scenarios: {
  name: string;
  request: ReplanRequest;
  verify: (response: ReplanResponse) => void;
}[] = [
  {
    name: 'fatigue-and-more-time',
    request: {
      plan: demoPlan,
      checkIn: demoCheckIn,
      message: 'Ich habe keinen Kopf mehr für Statistik und will das lieber länger machen.',
    },
    verify: (response) => {
      assert.equal(response.result.energy, 'low');
      assert.equal(response.result.sleepHours, demoCheckIn.sleepHours);
      assert.equal(response.proposedPlan!.items.find((item) => item.id === 'study')?.duration, 120);
    },
  },
  {
    name: 'extend-running-task',
    request: {
      plan: { ...demoPlan, now: 840, availableFrom: 840 },
      checkIn: demoCheckIn,
      message: 'Ich brauche für die aktuelle Aufgabe eine halbe Stunde länger.',
    },
    verify: (response) => {
      const study = response.proposedPlan!.items.find((item) => item.id === 'study')!;
      assert.equal(study.duration, 120);
      assert.equal(study.start, 810);
    },
  },
  {
    name: 'clarification-follow-up',
    request: {
      plan: demoPlan,
      checkIn: demoCheckIn,
      conversation: [
        {
          message: 'Ich habe keinen Kopf mehr dafür und will lieber länger machen.',
          reply: 'Welche Aufgabe meinst du?',
        },
      ],
      message: 'Statistik',
    },
    verify: (response) => {
      assert.equal(response.result.energy, 'low');
      assert.equal(response.proposedPlan!.items.find((item) => item.id === 'study')?.duration, 120);
    },
  },
  {
    name: 'explicit-fixed-appointment-move',
    request: {
      plan: demoPlan,
      checkIn: demoCheckIn,
      message: 'Bitte das Team-Meeting 15 Minuten früher.',
    },
    verify: (response) => {
      assert.equal(response.proposedPlan!.items.find((item) => item.id === 'team')?.start, 915);
      assert.equal(response.proposedPlan!.items.find((item) => item.id === 'team')?.fixed, true);
    },
  },
  {
    name: 'delay-and-energy',
    request: {
      plan: demoPlan,
      checkIn: demoCheckIn,
      message: demoPrompts.find((prompt) => prompt.label === 'Mein Zug hat Verspätung')!.message,
    },
    verify: (response) => {
      assert.equal(response.result.availabilityFrom, 840);
      assert.equal(response.result.energy, 'low');
      assert.equal(response.result.sleepHours, 5);
    },
  },
  {
    name: 'marketing-screenshot',
    request: {
      plan: demoPlan,
      checkIn: demoCheckIn,
      message:
        'Ich schreib morgen noch eine marketing Klausur und muss noch lernen kannst du das einplanen und irrelevante sachen austauschen',
    },
    verify: (response) => {
      const marketing = response.proposedPlan!.items.find((item) => /marketing/i.test(item.title));
      assert.ok(marketing);
      assert.notEqual(marketing.start, null);
      assert.equal(marketing.duration, 90);
      assert.equal(
        response.proposedPlan!.items.find((item) => item.id === 'study')?.title,
        demoPlan.items.find((item) => item.id === 'study')?.title,
      );
      assert.equal(response.proposedPlan!.items.length, demoPlan.items.length + 1);
    },
  },
  {
    name: 'edit-existing-marketing',
    request: {
      plan: marketingPlan,
      checkIn: demoCheckIn,
      message: 'Bitte die Marketing-Lernzeit auf 60 Minuten kürzen.',
    },
    verify: (response) => {
      const marketing = response.proposedPlan!.items.find((item) => item.id === 'marketing');
      assert.equal(marketing?.duration, 60);
      assert.notEqual(marketing?.start, null);
      assert.equal(response.proposedPlan!.items.length, marketingPlan.items.length);
    },
  },
  {
    name: 'create-and-change-context',
    request: {
      plan: demoPlan,
      checkIn: demoCheckIn,
      message:
        'Ich muss heute 45 Minuten für die Marketing-Klausur lernen und bin erst ab 14 Uhr da.',
    },
    verify: (response) => {
      const marketing = response.proposedPlan!.items.find((item) => /marketing/i.test(item.title));
      assert.ok(marketing);
      assert.equal(marketing.duration, 45);
      assert.notEqual(marketing.start, null);
      assert.equal(response.result.availabilityFrom, 840);
    },
  },
];

const selected = process.argv.slice(2);
const checks = scenarios.filter((scenario) => !selected.length || selected.includes(scenario.name));
assert.ok(checks.length, 'No matching scenarios.');
for (const [index, scenario] of checks.entries()) {
  // Space requests to avoid overwhelming the shared demo model quota.
  if (index > 0) await setTimeout(25000);
  let response: ReplanResponse;
  if (process.env.REPLAN_BASE_URL) {
    const base = new URL(process.env.REPLAN_BASE_URL);
    const result = await fetch(new URL('/api/replan', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base.origin },
      body: JSON.stringify(scenario.request),
      signal: AbortSignal.timeout(70000),
    });
    assert.equal(result.status, 200, `${scenario.name}: HTTP ${result.status}`);
    response = replanResponseSchema.parse(await result.json());
  } else response = await generatePlan(scenario.request, config);
  assert.equal(response.result.status, 'proposal', `${scenario.name}: ${response.result.summary}`);
  assert.ok(response.proposedPlan);
  assert.deepEqual(validatePlan(response.proposedPlan), []);
  scenario.verify(response);
  console.log(
    JSON.stringify({
      scenario: scenario.name,
      ...response.meta,
      status: response.result.status,
      changes: response.proposedPlan.items
        .filter((item) =>
          hasItemChanged(
            scenario.request.plan.items.find((before) => before.id === item.id),
            item,
          ),
        )
        .map(({ title, start, duration }) => ({ title, start, duration })),
    }),
  );
}
