import { test } from 'node:test';
import assert from 'node:assert/strict';
import { energyFromLevel, energyLevelOf } from '../shared/contracts';

test('five energy steps map onto the three planner levels', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(energyFromLevel), ['low', 'low', 'medium', 'high', 'high']);
});

test('fine energy level falls back when missing or out of band', () => {
  assert.equal(energyLevelOf({ energy: 'high', energyLevel: 5 }), 5);
  assert.equal(energyLevelOf({ energy: 'medium' }), 3);
  // The planner lowered energy after the check-in; the stale fine level must not win.
  assert.equal(energyLevelOf({ energy: 'low', energyLevel: 5 }), 2);
});
