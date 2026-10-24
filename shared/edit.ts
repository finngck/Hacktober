import { itemSchema, validatePlan, type Plan, type ScheduleItem } from './contracts.js';

/** Manual edits preserve elapsed work and use the same plan rules as AI proposals. */
export function editTaskInPlan(plan: Plan, change: ScheduleItem): Plan {
  const before = plan.items.find((item) => item.id === change.id);
  if (!before) throw new Error('This task no longer exists.');
  const item = itemSchema.parse(change);
  const started = before.start !== null && before.start < plan.now;
  if (started && (item.start !== before.start || item.duration !== before.duration))
    throw new Error('A started block must keep its start and duration.');
  if (!started && item.start !== null && item.start < plan.now)
    throw new Error('Choose a start time at or after the current demo time.');
  const next = {
    ...plan,
    items: plan.items.map((current) => (current.id === item.id ? item : current)),
  };
  const issues = validatePlan(next);
  if (issues.length) throw new Error(issues.join(' '));
  return next;
}
