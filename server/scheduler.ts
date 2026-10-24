import {
  formatTime,
  energyLevelOf,
  hasItemChanged,
  materializeProposal,
  type Energy,
  type ModelResult,
  type Plan,
  type ReplanRequest,
  type ScheduleItem,
} from '../shared/contracts.js';
import type { Signals } from '../shared/measures.js';

export type PlanningIntent = {
  status: 'ready' | 'clarification';
  summary: string;
  availabilityFrom: number;
  energy: Energy;
  sleepHours: number;
  question: string | null;
  taskOrder: string[];
  focusIds?: string[];
  deferIds: string[];
  moves?: { id: string; start: number | null; shiftMinutes: number | null }[];
  reasons: { id: string; reason: string }[];
  signals?: Signals;
};
type Occupied = { start: number; end: number };

function findSlot(
  item: ScheduleItem,
  occupied: Occupied[],
  from: number,
  dayEnd: number,
  preferOriginal: boolean,
): number | null {
  const limit = Math.min(item.deadline ?? dayEnd, dayEnd);
  const fits = (start: number) =>
    start >= from &&
    start + item.duration <= limit &&
    occupied.every((block) => start + item.duration <= block.start || start >= block.end);
  if (preferOriginal && item.start !== null && fits(item.start)) return item.start;
  let candidate = from;
  for (const block of occupied.toSorted((a, b) => a.start - b.start)) {
    if (candidate + item.duration <= block.start) break;
    if (candidate < block.end) candidate = block.end;
  }
  return fits(candidate) ? candidate : null;
}

/** Gemma supplies interpretation and priorities; this function owns time arithmetic. */
export function scheduleFromIntent(
  request: ReplanRequest,
  intent: PlanningIntent,
  originalPlan: Plan = request.plan,
  compact = false,
): { result: ModelResult; proposedPlan: Plan | null } {
  const { plan, checkIn } = request;
  const base = {
    summary: intent.summary,
    availabilityFrom: intent.availabilityFrom,
    energy: intent.energy,
    energyLevel: energyLevelOf({ energy: intent.energy, energyLevel: checkIn.energyLevel }),
    sleepHours: intent.sleepHours,
    question: null,
  };
  const conflict = (summary: string) => ({
    result: { ...base, status: 'conflict' as const, summary, placements: [] },
    proposedPlan: null,
  });
  if (intent.status === 'clarification')
    return {
      result: {
        ...base,
        status: 'clarification',
        question: intent.question || intent.summary,
        placements: [],
      },
      proposedPlan: null,
    };
  if (intent.availabilityFrom < plan.now)
    return conflict('The new availability is before the demo time. Give a time later in the day.');
  if (intent.availabilityFrom >= plan.dayEnd)
    return conflict(
      `You're only available from ${formatTime(intent.availabilityFrom)}, but your day ends at ${formatTime(plan.dayEnd)}. Adjust your availability or the day window.`,
    );

  // Fixed tasks never move on their own; they move only when the user explicitly asks for it.
  const movedStarts = new Map<string, number>();
  for (const move of intent.moves ?? []) {
    const item = plan.items.find((candidate) => candidate.id === move.id);
    if (!item) continue;
    if (item.start !== null && item.start < plan.now)
      return conflict(`"${item.title}" has already started or is in the past and can't be moved.`);
    const target =
      move.start ?? (item.start === null ? null : item.start + (move.shiftMinutes ?? 0));
    if (target === null)
      return conflict(
        `The new time for "${item.title}" is missing. Tell me the start time you want.`,
      );
    if (target < plan.now || target < plan.dayStart || target + item.duration > plan.dayEnd)
      return conflict(
        `"${item.title}" doesn't fit into the day at ${formatTime(target)} (${formatTime(plan.now)}–${formatTime(plan.dayEnd)}). Pick another time.`,
      );
    if (item.deadline !== null && target + item.duration > item.deadline)
      return conflict(
        `"${item.title}" would miss its ${formatTime(item.deadline)} deadline. Pick an earlier time.`,
      );
    movedStarts.set(item.id, target);
  }
  const items = plan.items.map((item) =>
    movedStarts.has(item.id) ? { ...item, start: movedStarts.get(item.id)! } : item,
  );
  const locked = items.filter(
    (item) =>
      item.fixed || movedStarts.has(item.id) || (item.start !== null && item.start < plan.now),
  );
  const lockedBlocks = locked
    .filter((item) => item.start !== null)
    .toSorted((a, b) => a.start! - b.start!);
  for (let index = 1; index < lockedBlocks.length; index++) {
    const previous = lockedBlocks[index - 1];
    if (previous.start! + previous.duration > lockedBlocks[index].start!)
      return conflict(
        `"${previous.title}" (${formatTime(previous.start!)}–${formatTime(previous.start! + previous.duration)}) and "${lockedBlocks[index].title}" (from ${formatTime(lockedBlocks[index].start!)}) would overlap. Explicitly move one of the two appointments.`,
      );
  }
  const unavailableFixed = locked.find(
    (item) => item.start !== null && item.start >= plan.now && item.start < intent.availabilityFrom,
  );
  if (unavailableFixed)
    return conflict(
      `"${unavailableFixed.title}" is fixed at ${formatTime(unavailableFixed.start!)}. You're only available from ${formatTime(intent.availabilityFrom)}. Tell me explicitly if I should move the appointment, or change your availability; I won't move it on my own.`,
    );

  const lockedIds = new Set(locked.map((item) => item.id));
  const focusIds = new Set(intent.focusIds ?? []);
  const deferIds = new Set(intent.deferIds);
  const placements = new Map(
    locked.map((item) => [
      item.id,
      {
        id: item.id,
        start: item.start,
        reason: movedStarts.has(item.id)
          ? `Moved to ${formatTime(item.start!)} as you asked.`
          : item.fixed
            ? 'Fixed appointment stays unchanged.'
            : 'Past or started block stays unchanged.',
      },
    ]),
  );
  const occupied: Occupied[] = locked
    .filter((item) => item.start !== null)
    .map((item) => ({ start: item.start!, end: item.start! + item.duration }));
  const flexible = items.filter((item) => !lockedIds.has(item.id));
  const excluded = (item: ScheduleItem) =>
    item.tags.some((tag) => checkIn.exclusions.includes(tag));
  const recovery = (item: ScheduleItem) =>
    intent.energy === 'low' &&
    item.category === 'recovery' &&
    item.start !== null &&
    !excluded(item);
  const mandatory = flexible
    .filter((item) => item.deadline !== null || recovery(item))
    .toSorted((a, b) => (a.deadline ?? plan.dayEnd) - (b.deadline ?? plan.dayEnd));

  function place(item: ScheduleItem) {
    const start = findSlot(item, occupied, intent.availabilityFrom, plan.dayEnd, !compact);
    if (start === null) return false;
    occupied.push({ start, end: start + item.duration });
    const before = originalPlan.items.find((source) => source.id === item.id);
    const reason = !before
      ? 'Newly added and scheduled for your request.'
      : before.title !== item.title || before.duration !== item.duration
        ? `Edited as requested: ${item.duration} min${before.title === item.title ? '' : `, previously "${before.title}"`}.`
        : item.deadline !== null
          ? `Due today before ${formatTime(item.deadline)}; this slot is reserved for it.`
          : recovery(item)
            ? 'Your recovery break stays scheduled while your energy is low.'
            : focusIds.has(item.id)
              ? 'Scheduled ahead of optional tasks for your request.'
              : start === item.start
                ? 'Still fits into your day.'
                : 'Moved to a free slot.';
    placements.set(item.id, { id: item.id, start, reason });
    return true;
  }
  for (const item of mandatory) {
    if (excluded(item))
      return conflict(
        `"${item.title}" has a deadline today but conflicts with an exclusion. Decide which one should apply.`,
      );
    if (!place(item)) {
      if (!compact) return scheduleFromIntent(request, intent, originalPlan, true);
      return conflict(
        `No suitable slot between your fixed appointments was found for "${item.title}" (${item.duration} min${item.deadline === null ? '' : `, deadline ${formatTime(item.deadline)}`}). Adjust the duration, your availability or your commitments.`,
      );
    }
  }
  // Keep existing breaks where possible before reserving newly requested work.
  for (const item of flexible.filter(
    (item) =>
      item.category === 'recovery' &&
      item.start !== null &&
      !placements.has(item.id) &&
      !deferIds.has(item.id) &&
      !excluded(item) &&
      !focusIds.has(item.id),
  ))
    place(item);
  const focusOrder = new Map(intent.taskOrder.map((id, index) => [id, index]));
  for (const item of flexible
    .filter((item) => focusIds.has(item.id) && !placements.has(item.id))
    .toSorted((a, b) => (focusOrder.get(a.id) ?? 40) - (focusOrder.get(b.id) ?? 40))) {
    if (excluded(item))
      return conflict(
        `"${item.title}" conflicts with an exclusion. Resolve that before the task is scheduled.`,
      );
    if (!place(item)) {
      if (!compact) return scheduleFromIntent(request, intent, originalPlan, true);
      return conflict(
        `There's no free slot for your requested task "${item.title}" (${item.duration} min). Shorten the task or adjust the day window.`,
      );
    }
  }
  const priority = { high: 0, medium: 1, low: 2 };
  const order = new Map(intent.taskOrder.map((id, index) => [id, index]));
  // The focus chosen in the daily check-in gets the first optional slot.
  const focusId = checkIn.focusTaskId;
  if (focusId !== null) order.set(focusId, -1);
  const optional = flexible
    .filter((item) => !placements.has(item.id))
    .toSorted(
      (a, b) =>
        (order.get(a.id) ?? 40 + priority[a.priority]) -
        (order.get(b.id) ?? 40 + priority[b.priority]),
    );
  for (const item of optional) {
    let reason = '';
    if (excluded(item)) reason = 'You excluded this activity in your preferences.';
    else if (item.id !== focusId && intent.energy === 'low' && item.effort === 'high')
      reason = 'This demanding task stays open today because your energy is low.';
    else if (deferIds.has(item.id)) reason = 'This task stays open today as you asked.';
    else if (place(item)) continue;
    else reason = "There's no free slot left today that's long enough.";
    placements.set(item.id, { id: item.id, start: null, reason });
  }
  const result: ModelResult = {
    ...base,
    status: 'proposal',
    placements: plan.items.map((item) => placements.get(item.id)!),
  };
  const proposedPlan = materializeProposal(request, result, new Set(movedStarts.keys()));
  result.summary = describeProposal(originalPlan, proposedPlan);
  return { result, proposedPlan };
}

/** Describe only committed draft operations and placements, never model claims. */
function describeProposal(before: Plan, after: Plan): string {
  const changed = after.items.filter((item) =>
    hasItemChanged(
      before.items.find((old) => old.id === item.id),
      item,
    ),
  );
  const added = changed.filter((item) => !before.items.some((old) => old.id === item.id));
  const edited = changed.filter((item) => {
    const old = before.items.find((source) => source.id === item.id);
    return old && hasItemChanged({ ...old, start: item.start }, item);
  });
  const open = changed.filter((item) => item.start === null);
  const moved = changed.filter(
    (item) => item.start !== null && !added.includes(item) && !edited.includes(item),
  );
  const names = (items: ScheduleItem[]) =>
    items
      .slice(0, 2)
      .map((item) => `"${item.title}"`)
      .join(', ') + (items.length > 2 ? ` and ${items.length - 2} more` : '');
  const parts: string[] = [];
  if (added.length) parts.push(`Newly scheduled: ${names(added)}.`);
  if (edited.length) parts.push(`Edited and scheduled: ${names(edited)}.`);
  if (moved.length) parts.push(`Rescheduled: ${names(moved)}.`);
  if (open.length) parts.push(`Open today: ${names(open)}. These tasks are kept.`);
  if (before.availableFrom !== after.availableFrom)
    parts.push(`Available from ${formatTime(after.availableFrom)}.`);
  return (
    parts.join(' ').slice(0, 900) ||
    'Your tasks still fit into the day; the time blocks stay unchanged.'
  );
}
