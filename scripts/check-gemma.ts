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

// Explicit opt-in: five real requests, each with at most one bounded repair.
const marketingPlan: Plan = structuredClone(demoPlan);
marketingPlan.items.push({
  ...marketingPlan.items.find((item) => item.id === 'study')!,
  id: 'marketing',
  title: 'Study for the marketing exam',
  start: null,
  deadline: null,
});
const scenarios: {
  name: string;
  request: ReplanRequest;
  verify: (response: ReplanResponse) => void;
}[] = [
  {
    name: 'explicit-fixed-appointment-move',
    request: {
      plan: demoPlan,
      checkIn: demoCheckIn,
      message: 'Please move the team meeting 15 minutes earlier.',
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
      message: demoPrompts.find((prompt) => prompt.label === 'My train is delayed')!.message,
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
        'i have a marketing exam tomorrow and still need to study can you fit that in and swap out stuff that doesnt matter',
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
      message: 'Please cut the marketing study time to 60 minutes.',
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
        'I need to study 45 minutes for the marketing exam today and I am only around from 14:00.',
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
