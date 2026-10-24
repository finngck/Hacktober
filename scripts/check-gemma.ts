import assert from 'node:assert/strict';
import { demoCheckIn, demoPlan, demoPrompts } from '../shared/demo';
import {
  hasItemChanged,
  validatePlan,
  type Plan,
  type ReplanRequest,
  type ReplanResponse,
} from '../shared/contracts';
import { config } from '../server/config';
import { generatePlan } from '../server/gemma';

// Explicit opt-in: four real requests, each with at most one bounded repair.
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

for (const scenario of scenarios) {
  const response = await generatePlan(scenario.request, config);
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
