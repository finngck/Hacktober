import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoPlan } from '../shared/demo';
import { editTaskInPlan } from '../shared/edit';

test('manual edits keep the original plan unchanged and preserve every other task', () => {
  const before = structuredClone(demoPlan);
  const task = before.items.find((item) => item.id === 'gym')!;
  const next = editTaskInPlan(before, { ...task, title: 'Evening workout', start: 1095 });
  assert.equal(next.items.find((item) => item.id === 'gym')!.start, 1095);
  assert.deepEqual(before, demoPlan);
  assert.deepEqual(
    next.items.filter((item) => item.id !== 'gym'),
    before.items.filter((item) => item.id !== 'gym'),
  );
});

test('a future task cannot be moved into elapsed time even when it would fit', () => {
  const task = demoPlan.items.find((item) => item.id === 'inbox')!;
  assert.throws(() => editTaskInPlan(demoPlan, { ...task, start: 480 }), /current demo time/);
});

test('started blocks can be renamed but cannot change their start or duration', () => {
  const task = demoPlan.items.find((item) => item.id === 'lunch')!;
  assert.equal(
    editTaskInPlan(demoPlan, { ...task, title: 'Lunch break' }).items[0].title,
    'Lunch break',
  );
  assert.throws(() => editTaskInPlan(demoPlan, { ...task, start: 700 }), /started block/);
  assert.throws(() => editTaskInPlan(demoPlan, { ...task, duration: 30 }), /started block/);
});

test('manual moves reject overlaps and missed deadlines', () => {
  const task = demoPlan.items.find((item) => item.id === 'study')!;
  assert.throws(() => editTaskInPlan(demoPlan, { ...task, start: 900 }), /overlap/);
  assert.throws(() => editTaskInPlan(demoPlan, { ...task, start: 1050 }), /deadline/);
});

test('a flexible task may stay open; fixed tasks and unknown IDs are rejected', () => {
  const task = demoPlan.items.find((item) => item.id === 'gym')!;
  assert.equal(
    editTaskInPlan(demoPlan, { ...task, start: null }).items.find((item) => item.id === 'gym')!
      .start,
    null,
  );
  const fixed = demoPlan.items.find((item) => item.id === 'team')!;
  assert.throws(() => editTaskInPlan(demoPlan, { ...fixed, start: null }), /fixed appointment/);
  assert.throws(() => editTaskInPlan(demoPlan, { ...task, id: 'unknown' }), /no longer exists/);
});
