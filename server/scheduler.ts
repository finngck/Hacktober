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
    return conflict(
      'Die neue Verfügbarkeit liegt vor der Demo-Uhrzeit. Gib eine Uhrzeit für den restlichen Tag an.',
    );
  if (intent.availabilityFrom >= plan.dayEnd)
    return conflict(
      `Du bist erst ab ${formatTime(intent.availabilityFrom)} verfügbar, dein Tag endet um ${formatTime(plan.dayEnd)}. Passe die Verfügbarkeit oder den Tagesrahmen an.`,
    );

  // Fixed tasks never move on their own; they move only when the user explicitly asks for it.
  const movedStarts = new Map<string, number>();
  for (const move of intent.moves ?? []) {
    const item = plan.items.find((candidate) => candidate.id === move.id);
    if (!item) continue;
    if (item.start !== null && item.start < plan.now)
      return conflict(
        `„${item.title}“ hat bereits begonnen oder liegt in der Vergangenheit und lässt sich nicht verschieben.`,
      );
    const target =
      move.start ?? (item.start === null ? null : item.start + (move.shiftMinutes ?? 0));
    if (target === null)
      return conflict(
        `Für „${item.title}“ fehlt die neue Uhrzeit. Nenne die gewünschte Startzeit.`,
      );
    if (target < plan.now || target < plan.dayStart || target + item.duration > plan.dayEnd)
      return conflict(
        `„${item.title}“ passt um ${formatTime(target)} nicht in den Tag (${formatTime(plan.now)}–${formatTime(plan.dayEnd)}). Wähle eine andere Uhrzeit.`,
      );
    if (item.deadline !== null && target + item.duration > item.deadline)
      return conflict(
        `„${item.title}“ würde ihre Frist um ${formatTime(item.deadline)} überschreiten. Wähle eine frühere Uhrzeit.`,
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
  for (const item of lockedBlocks) {
    if (item.start! + item.duration > Math.min(item.deadline ?? plan.dayEnd, plan.dayEnd))
      return conflict(
        `„${item.title}“ passt mit ${item.duration} Minuten nicht vor die Frist oder das Tagesende. Wähle eine kürzere Dauer.`,
      );
  }
  for (let index = 1; index < lockedBlocks.length; index++) {
    const previous = lockedBlocks[index - 1];
    if (previous.start! + previous.duration > lockedBlocks[index].start!)
      return conflict(
        `„${previous.title}“ (${formatTime(previous.start!)}–${formatTime(previous.start! + previous.duration)}) und „${lockedBlocks[index].title}“ (ab ${formatTime(lockedBlocks[index].start!)}) würden sich überschneiden. Verschiebe einen der beiden Termine ausdrücklich.`,
      );
  }
  const unavailableFixed = locked.find(
    (item) => item.start !== null && item.start >= plan.now && item.start < intent.availabilityFrom,
  );
  if (unavailableFixed)
    return conflict(
      `„${unavailableFixed.title}“ beginnt fest um ${formatTime(unavailableFixed.start!)}. Du bist erst ab ${formatTime(intent.availabilityFrom)} verfügbar. Sag mir ausdrücklich, ob ich den Termin verschieben soll, oder ändere die Verfügbarkeit; ich verschiebe ihn nicht von allein.`,
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
          ? `Auf deinen Wunsch auf ${formatTime(item.start!)} verschoben.`
          : item.fixed
            ? 'Fester Termin bleibt unverändert.'
            : item.duration !== originalPlan.items.find((before) => before.id === item.id)?.duration
              ? `Wie angefragt auf ${item.duration} Minuten angepasst; der Beginn bleibt erhalten.`
              : 'Vergangener oder begonnener Block bleibt unverändert.',
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
      ? 'Neu angelegt und für dein Anliegen eingeplant.'
      : before.title !== item.title || before.duration !== item.duration
        ? `Wie angefragt bearbeitet: ${item.duration} Minuten${before.title === item.title ? '' : `, zuvor „${before.title}“`}.`
        : item.deadline !== null
          ? `Heute vor ${formatTime(item.deadline)} fällig; dafür ist dieses Zeitfenster reserviert.`
          : recovery(item)
            ? 'Deine Erholungspause bleibt bei wenig Energie eingeplant.'
            : focusIds.has(item.id)
              ? 'Für dein Anliegen vor optionalen Aufgaben eingeplant.'
              : start === item.start
                ? 'Passt weiterhin in deinen Tag.'
                : 'In ein freies Zeitfenster verschoben.';
    placements.set(item.id, { id: item.id, start, reason });
    return true;
  }
  for (const item of mandatory) {
    if (excluded(item))
      return conflict(
        `„${item.title}“ hat eine heutige Frist, widerspricht aber einem Ausschluss. Kläre, welche Vorgabe gelten soll.`,
      );
    if (!place(item)) {
      if (!compact) return scheduleFromIntent(request, intent, originalPlan, true);
      return conflict(
        `Für „${item.title}“ (${item.duration} Minuten${item.deadline === null ? '' : `, Frist ${formatTime(item.deadline)}`}) wurde zwischen den festen Terminen kein passendes Zeitfenster gefunden. Passe Dauer, Verfügbarkeit oder Verpflichtungen an.`,
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
        `„${item.title}“ widerspricht einem Ausschluss. Kläre diese Vorgabe, bevor die Aufgabe eingeplant wird.`,
      );
    if (!place(item)) {
      if (!compact) return scheduleFromIntent(request, intent, originalPlan, true);
      return conflict(
        `Für deine angeforderte Aufgabe „${item.title}“ (${item.duration} Minuten) ist kein passendes Zeitfenster frei. Verkürze die Aufgabe oder passe den Tagesrahmen an.`,
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
    if (excluded(item)) reason = 'Diese Aktivität ist in deinen Präferenzen ausgeschlossen.';
    else if (item.id !== focusId && intent.energy === 'low' && item.effort === 'high')
      reason = 'Die anspruchsvolle Aufgabe bleibt bei wenig Energie heute offen.';
    else if (deferIds.has(item.id)) reason = 'Auf deinen Wunsch bleibt diese Aufgabe heute offen.';
    else if (place(item)) continue;
    else reason = 'Heute ist kein ausreichend großes freies Zeitfenster mehr vorhanden.';
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
      .map((item) => `„${item.title}“`)
      .join(', ') + (items.length > 2 ? ` und ${items.length - 2} weitere` : '');
  const parts: string[] = [];
  if (added.length) parts.push(`Neu eingeplant: ${names(added)}.`);
  if (edited.length) parts.push(`Bearbeitet und eingeplant: ${names(edited)}.`);
  if (moved.length) parts.push(`Zeitlich angepasst: ${names(moved)}.`);
  if (open.length) parts.push(`Heute offen: ${names(open)}. Diese Aufgaben bleiben erhalten.`);
  if (before.availableFrom !== after.availableFrom)
    parts.push(`Verfügbar ab ${formatTime(after.availableFrom)}.`);
  return (
    parts.join(' ').slice(0, 900) ||
    'Deine Aufgaben passen weiterhin in den Tag; die Zeitblöcke bleiben unverändert.'
  );
}
