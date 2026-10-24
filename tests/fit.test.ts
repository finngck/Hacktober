import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, type ScheduleItem } from '../shared/contracts';
import { demoPlan } from '../shared/demo';
import { fitIntoDay } from '../shared/fit';

const plan = () => structuredClone(demoPlan);
const task = (patch: Partial<ScheduleItem>): ScheduleItem => ({
  id: crypto.randomUUID(),
  title: 'Meeting mit Freunden',
  category: 'social',
  start: 1380,
  duration: 59,
  fixed: true,
  priority: 'medium',
  effort: 'medium',
  deadline: null,
  tags: [],
  ...patch,
});

test('a task after the end of the day moves to the earliest free slot and becomes movable', () => {
  const source = plan();
  const { planItems, items, notes } = fitIntoDay(source, [task({})]);
  assert.equal(items[0].fixed, false);
  assert.ok(items[0].start !== null && items[0].start >= source.availableFrom);
  assert.equal(notes.length, 1);
  assert.deepEqual(validatePlan({ ...source, items: [...planItems, ...items] }), []);
  for (const item of source.items.filter((entry) => entry.fixed || entry.deadline !== null))
    assert.equal(planItems.find((entry) => entry.id === item.id)?.start, item.start);
});

test('times that already fit stay unchanged and keep their fixed flag', () => {
  const source = plan();
  const free = fitIntoDay(source, [task({ start: source.availableFrom, duration: 5 })]);
  const kept = free.items[0];
  if (free.notes.length === 0) {
    assert.equal(kept.fixed, true);
    assert.equal(kept.start, source.availableFrom);
  } else {
    assert.equal(kept.fixed, false);
  }
});

test('imported tasks do not overlap each other and open tasks stay open', () => {
  const source = plan();
  const { planItems, items } = fitIntoDay(source, [
    task({ title: 'A', start: 1400, duration: 30 }),
    task({ title: 'B', start: 1400, duration: 30 }),
    task({ title: 'C', start: null, fixed: true }),
  ]);
  assert.deepEqual(validatePlan({ ...source, items: [...planItems, ...items] }), []);
  assert.equal(items[2].start, null);
  assert.equal(items[2].fixed, false);
});

test('a task that cannot fit anywhere stays open instead of failing', () => {
  const source = plan();
  const { items, notes } = fitIntoDay(source, [task({ start: 1400, duration: 480 })]);
  assert.equal(items[0].start, null);
  assert.equal(items[0].fixed, false);
  assert.match(notes[0], /offen/);
});
