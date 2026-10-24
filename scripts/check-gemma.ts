import assert from 'node:assert/strict';
import { demoCheckIn, demoPlan, demoPrompts } from '../shared/demo';
import { validatePlan } from '../shared/contracts';
import { config } from '../server/config';
import { generatePlan } from '../server/gemma';

// Explicit opt-in: this command makes one real request (or one bounded repair).
const response = await generatePlan(
  { plan: demoPlan, checkIn: demoCheckIn, message: demoPrompts[0].message },
  config,
);
assert.equal(response.result.status, 'proposal', response.result.summary);
assert.ok(response.proposedPlan);
assert.deepEqual(validatePlan(response.proposedPlan), []);
assert.equal(response.result.availabilityFrom, 840);
assert.equal(response.result.energy, 'low');
assert.equal(response.result.sleepHours, 5);
console.log(
  JSON.stringify(
    {
      model: response.meta.model,
      elapsedMs: response.meta.elapsedMs,
      attempts: response.meta.attempts,
      status: response.result.status,
      changes: response.proposedPlan.items
        .filter(
          (item) => demoPlan.items.find((before) => before.id === item.id)?.start !== item.start,
        )
        .map((item) => ({ title: item.title, start: item.start })),
    },
    null,
    2,
  ),
);
