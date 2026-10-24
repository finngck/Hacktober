import { z } from 'zod';
import {
  energySchema,
  formatTime,
  materializeProposal,
  type ModelResult,
  type Plan,
  type ReplanRequest,
  type ScheduleItem,
} from '../shared/contracts';

export const intentSchema = z.object({
  status: z.enum(['ready', 'clarification']),
  summary: z.string().min(1).max(900),
  availabilityFrom: z.number().int().min(0).max(1440),
  energy: energySchema,
  sleepHours: z.number().min(0).max(16),
  question: z.string().max(500).nullable(),
  taskOrder: z.array(z.string().max(80)).max(40),
  deferIds: z.array(z.string().max(80)).max(40),
  reasons: z
    .array(z.object({ id: z.string().max(80), reason: z.string().min(1).max(400) }))
    .max(40),
});
export type PlanningIntent = z.infer<typeof intentSchema>;
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
): { result: ModelResult; proposedPlan: Plan | null } {
  const { plan, checkIn } = request;
  const base = {
    summary: intent.summary,
    availabilityFrom: intent.availabilityFrom,
    energy: intent.energy,
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

  const locked = plan.items.filter(
    (item) => item.fixed || (item.start !== null && item.start < plan.now),
  );
  const unavailableFixed = locked.find(
    (item) => item.start !== null && item.start >= plan.now && item.start < intent.availabilityFrom,
  );
  if (unavailableFixed)
    return conflict(
      `„${unavailableFixed.title}“ beginnt fest um ${formatTime(unavailableFixed.start!)}. Du bist erst ab ${formatTime(intent.availabilityFrom)} verfügbar. Kläre diesen Termin oder ändere die Verfügbarkeit; ich verschiebe ihn nicht automatisch.`,
    );

  const lockedIds = new Set(locked.map((item) => item.id));
  const reasons = new Map(intent.reasons.map((item) => [item.id, item.reason]));
  const placements = new Map(
    locked.map((item) => [
      item.id,
      {
        id: item.id,
        start: item.start,
        reason: item.fixed
          ? 'Fester Termin bleibt unverändert.'
          : 'Vergangener oder begonnener Block bleibt unverändert.',
      },
    ]),
  );
  const occupied: Occupied[] = locked
    .filter((item) => item.start !== null)
    .map((item) => ({ start: item.start!, end: item.start! + item.duration }));
  const flexible = plan.items.filter((item) => !lockedIds.has(item.id));
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
    const start = findSlot(
      item,
      occupied,
      intent.availabilityFrom,
      plan.dayEnd,
      item.deadline === null,
    );
    if (start === null) return false;
    occupied.push({ start, end: start + item.duration });
    const reason =
      item.deadline !== null
        ? `Heute vor ${formatTime(item.deadline)} fällig; dafür ist dieses Zeitfenster reserviert.`
        : recovery(item)
          ? 'Deine Erholungspause bleibt bei wenig Energie eingeplant.'
          : start === item.start
            ? 'Passt weiterhin in deinen Tag.'
            : reasons.get(item.id) || 'In ein freies Zeitfenster verschoben.';
    placements.set(item.id, { id: item.id, start, reason });
    return true;
  }
  for (const item of mandatory) {
    if (excluded(item))
      return conflict(
        `„${item.title}“ hat eine heutige Frist, widerspricht aber einem Ausschluss. Kläre, welche Vorgabe gelten soll.`,
      );
    if (!place(item))
      return conflict(
        `Für „${item.title}“ (${item.duration} Minuten${item.deadline === null ? '' : `, Frist ${formatTime(item.deadline)}`}) wurde zwischen den festen Terminen kein passendes Zeitfenster gefunden. Passe Dauer, Verfügbarkeit oder Verpflichtungen an.`,
      );
  }
  const priority = { high: 0, medium: 1, low: 2 };
  const order = new Map(intent.taskOrder.map((id, index) => [id, index]));
  const deferIds = new Set(intent.deferIds);
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
    else if (intent.energy === 'low' && item.effort === 'high')
      reason = 'Die anspruchsvolle Aufgabe bleibt bei wenig Energie heute offen.';
    else if (deferIds.has(item.id))
      reason = reasons.get(item.id) || 'Nach deiner Änderung bleibt diese Aufgabe heute offen.';
    else if (place(item)) continue;
    else reason = 'Heute ist kein ausreichend großes freies Zeitfenster mehr vorhanden.';
    placements.set(item.id, { id: item.id, start: null, reason });
  }
  const result: ModelResult = {
    ...base,
    status: 'proposal',
    placements: plan.items.map((item) => placements.get(item.id)!),
  };
  return { result, proposedPlan: materializeProposal(request, result) };
}
