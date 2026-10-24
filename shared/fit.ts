import { formatTime, type Plan, type ScheduleItem } from './contracts.js';

type Block = { start: number; end: number };

/**
 * Imported tasks can carry times that do not fit today (before now, after the day ends,
 * overlapping or past their deadline). Such a task moves to the earliest possible slot of the
 * remaining day and stays movable. If that slot is taken by movable tasks without a deadline,
 * they become open instead; fixed, begun and deadline tasks never move. Without any slot
 * the task stays open.
 */
export function fitIntoDay(
  plan: Plan,
  items: ScheduleItem[],
): { planItems: ScheduleItem[]; items: ScheduleItem[]; notes: string[] } {
  let planItems = plan.items;
  const placed: ScheduleItem[] = [];
  const notes: string[] = [];
  const isLocked = (item: ScheduleItem) =>
    item.fixed || item.deadline !== null || (item.start !== null && item.start < plan.now);
  const scheduled = () =>
    [...planItems, ...placed].filter((item) => item.start !== null) as (ScheduleItem & {
      start: number;
    })[];
  const overlaps = (a: Block, b: Block) => a.start < b.end && b.start < a.end;
  const span = (item: ScheduleItem, start: number): Block => ({
    start,
    end: start + item.duration,
  });
  const inDay = (item: ScheduleItem, start: number) =>
    start >= plan.availableFrom &&
    start + item.duration <= Math.min(item.deadline ?? plan.dayEnd, plan.dayEnd);

  for (const item of items) {
    if (item.start === null) {
      placed.push(item.fixed ? { ...item, fixed: false } : item);
      continue;
    }
    if (
      inDay(item, item.start) &&
      scheduled().every((other) => !overlaps(span(item, item.start!), span(other, other.start)))
    ) {
      placed.push(item);
      continue;
    }
    const lockedBlocks = scheduled().filter(isLocked);
    const starts = [
      plan.availableFrom,
      ...lockedBlocks.map((block) => block.start + block.duration),
    ].toSorted((a, b) => a - b);
    const start = starts.find(
      (candidate) =>
        inDay(item, candidate) &&
        lockedBlocks.every((other) => !overlaps(span(item, candidate), span(other, other.start))),
    );
    if (start === undefined) {
      placed.push({ ...item, start: null, fixed: false });
      notes.push(
        `„${item.title}“ passte nicht in den Tag und bleibt offen, bis du sie einplanen lässt.`,
      );
      continue;
    }
    const block = span(item, start);
    const displaced = scheduled().filter(
      (other) => !isLocked(other) && overlaps(block, span(other, other.start)),
    );
    const displacedIds = new Set(displaced.map((other) => other.id));
    planItems = planItems.map((other) =>
      displacedIds.has(other.id) ? { ...other, start: null } : other,
    );
    for (let index = 0; index < placed.length; index++)
      if (displacedIds.has(placed[index].id)) placed[index] = { ...placed[index], start: null };
    placed.push({ ...item, start, fixed: false });
    notes.push(
      `„${item.title}“ passte nicht in den Tag und liegt jetzt um ${formatTime(start)}, verschiebbar.` +
        (displaced.length
          ? ` Dafür sind offen: ${displaced.map((other) => other.title).join(', ')}.`
          : ''),
    );
  }
  return { planItems, items: placed, notes };
}
