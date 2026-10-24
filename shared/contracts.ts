import { z } from 'zod';
import { energyMeasuresSchema } from './measures.js';

export const categorySchema = z.enum(['study', 'work', 'recovery', 'movement', 'social']);
export const energySchema = z.enum(['low', 'medium', 'high']);
export const exclusionSchema = z.enum(['coffee', 'running', 'gym']);
export const sleepQualitySchema = z.enum(['poor', 'okay', 'good']);
const scale = z.number().int().min(1).max(5);
const minute = z.number().int().min(0).max(1440);

export const itemSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  category: categorySchema,
  start: minute.nullable(),
  duration: z.number().int().min(5).max(480),
  fixed: z.boolean(),
  priority: z.enum(['low', 'medium', 'high']),
  effort: energySchema,
  deadline: minute.nullable(),
  tags: z.array(exclusionSchema).max(3),
});

export const planSchema = z.object({
  date: z.iso.date(),
  timeZone: z.literal('Europe/Berlin'),
  now: minute,
  availableFrom: minute,
  dayStart: minute,
  dayEnd: minute,
  items: z.array(itemSchema).min(1).max(40),
});

export const checkInSchema = z.object({
  sleepHours: z.number().min(0).max(16),
  energy: energySchema,
  // Finer 1–5 reading behind `energy`; older check-ins only carry the coarse level.
  energyLevel: scale.optional(),
  productiveTime: z.enum(['morning', 'afternoon', 'any']),
  exclusions: z.array(exclusionSchema).max(3),
  // Defaults keep check-ins saved before these signals existed valid.
  sleepQuality: sleepQualitySchema.default('okay'),
  mood: scale.default(3),
  stress: scale.default(2),
  focusTaskId: z.string().max(80).nullable().default(null),
});

export const replanRequestSchema = z.object({
  plan: planSchema,
  checkIn: checkInSchema,
  message: z.string().trim().min(1).max(2000),
  // Only unresolved exchanges; accepting/discarding or changing the plan clears them.
  conversation: z
    .array(
      z.object({
        message: z.string().trim().min(1).max(2000),
        reply: z.string().trim().min(1).max(900),
      }),
    )
    .max(4)
    .optional(),
});

export const modelResultSchema = z.object({
  status: z.enum(['proposal', 'clarification', 'conflict']),
  summary: z.string().min(1).max(900),
  availabilityFrom: minute,
  energy: energySchema,
  // Finer 1–5 level for display; follows the check-in unless the planner changed energy.
  energyLevel: scale.optional(),
  sleepHours: z.number().min(0).max(16),
  question: z.string().max(500).nullable(),
  placements: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        start: minute.nullable(),
        reason: z.string().min(1).max(400),
      }),
    )
    .max(40),
});

export const replanResponseSchema = z.object({
  result: modelResultSchema,
  proposedPlan: planSchema.nullable(),
  measures: energyMeasuresSchema,
  meta: z.object({ model: z.string(), elapsedMs: z.number(), attempts: z.number() }),
});

export const imageTypeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_BASE64_LENGTH = 3_500_000;
export const extractRequestSchema = z.object({
  image: z
    .string()
    .min(4)
    .max(MAX_IMAGE_BASE64_LENGTH)
    .refine((value) => value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)),
  mimeType: imageTypeSchema,
});
export const extractedTaskSchema = z.object({
  title: z.string().trim().min(1).max(100),
  category: categorySchema,
  duration: z.number().int().min(5).max(480),
  start: minute.nullable(),
  deadline: minute.nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  fixed: z.boolean(),
  /** Date/time text exactly as shown in the image, so the user can check it. */
  when: z.string().max(80).nullable(),
});
export const extractResultSchema = z.object({
  tasks: z.array(extractedTaskSchema).max(20),
  note: z.string().max(400).nullable(),
});
export const extractResponseSchema = extractResultSchema.extend({
  meta: z.object({ model: z.string(), elapsedMs: z.number(), attempts: z.number() }),
});

export type Category = z.infer<typeof categorySchema>;
export type Energy = z.infer<typeof energySchema>;
export type ScheduleItem = z.infer<typeof itemSchema>;
export type Plan = z.infer<typeof planSchema>;
export type SleepQuality = z.infer<typeof sleepQualitySchema>;
export type CheckIn = z.infer<typeof checkInSchema>;
export type ReplanRequest = z.infer<typeof replanRequestSchema>;
export type ModelResult = z.infer<typeof modelResultSchema>;
export type ReplanResponse = z.infer<typeof replanResponseSchema>;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export type ExtractedTask = z.infer<typeof extractedTaskSchema>;
export type ExtractResponse = z.infer<typeof extractResponseSchema>;

export const categoryLabels: Record<Category, string> = {
  study: 'Lernen',
  work: 'Arbeit',
  recovery: 'Pause',
  movement: 'Bewegung',
  social: 'Freizeit',
};
export const energyLevelLabels = ['Sehr niedrig', 'Niedrig', 'Okay', 'Hoch', 'Sehr hoch'] as const;
/** The planner works with three levels; the check-in slider offers five. */
export const energyFromLevel = (level: number): Energy =>
  level <= 2 ? 'low' : level >= 4 ? 'high' : 'medium';
const defaultEnergyLevel: Record<Energy, number> = { low: 2, medium: 3, high: 4 };
/** The stored fine level, unless the planner has since moved energy to another band. */
export const energyLevelOf = (checkIn: { energy: Energy; energyLevel?: number }) =>
  checkIn.energyLevel !== undefined && energyFromLevel(checkIn.energyLevel) === checkIn.energy
    ? checkIn.energyLevel
    : defaultEnergyLevel[checkIn.energy];
export const sleepQualityLabels: Record<SleepQuality, string> = {
  poor: 'Unruhig',
  okay: 'Okay',
  good: 'Erholsam',
};
export const moodLabels = ['Mies', 'Gedrückt', 'Neutral', 'Gut', 'Richtig gut'] as const;
export const stressLabels = [
  'Entspannt',
  'Locker',
  'Etwas los',
  'Angespannt',
  'Überladen',
] as const;
export const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const parseTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export function hasItemChanged(before: ScheduleItem | undefined, after: ScheduleItem): boolean {
  return (
    !before ||
    before.title !== after.title ||
    before.category !== after.category ||
    before.start !== after.start ||
    before.duration !== after.duration ||
    before.priority !== after.priority ||
    before.effort !== after.effort ||
    before.deadline !== after.deadline ||
    before.fixed !== after.fixed ||
    before.tags.toSorted().join(',') !== after.tags.toSorted().join(',')
  );
}

export function validatePlan(plan: Plan): string[] {
  const errors: string[] = [];
  if (plan.dayStart > plan.now || plan.now >= plan.dayEnd)
    errors.push('Der Tagesrahmen ist ungültig.');
  if (plan.availableFrom < plan.now || plan.availableFrom > plan.dayEnd)
    errors.push('Die Verfügbarkeit liegt außerhalb des Tagesrahmens.');
  if (new Set(plan.items.map((item) => item.id)).size !== plan.items.length)
    errors.push('Aufgaben-IDs müssen eindeutig sein.');
  const scheduled = plan.items
    .filter((item) => item.start !== null)
    .toSorted((a, b) => a.start! - b.start!);
  for (const item of plan.items) {
    if (item.fixed && item.start === null)
      errors.push(`„${item.title}“ ist ein fester Termin und braucht eine Startzeit.`);
    if (item.start === null) continue;
    const end = item.start + item.duration;
    if (item.start < plan.dayStart || end > plan.dayEnd)
      errors.push(`„${item.title}“ liegt außerhalb des Tagesrahmens.`);
    if (item.start >= plan.now && item.start < plan.availableFrom)
      errors.push(`„${item.title}“ liegt vor der Verfügbarkeit.`);
    if (item.deadline !== null && end > item.deadline)
      errors.push(`„${item.title}“ überschreitet die Frist.`);
  }
  for (let index = 1; index < scheduled.length; index++) {
    const previous = scheduled[index - 1];
    if (previous.start! + previous.duration > scheduled[index].start!) {
      errors.push(`„${previous.title}“ und „${scheduled[index].title}“ überschneiden sich.`);
    }
  }
  return errors;
}

/** `movedIds` lists tasks the user explicitly asked to move; only those may leave their fixed time. */
export function materializeProposal(
  request: ReplanRequest,
  result: ModelResult,
  movedIds: ReadonlySet<string> = new Set(),
): Plan {
  if (result.status !== 'proposal') throw new Error('Es liegt noch kein Planvorschlag vor.');
  const source = request.plan;
  const errors: string[] = [];
  const placements = new Map(result.placements.map((item) => [item.id, item]));
  if (placements.size !== result.placements.length) errors.push('Doppelte Aufgaben im Vorschlag.');
  if (
    placements.size !== source.items.length ||
    [...placements.keys()].some((id) => !source.items.some((item) => item.id === id))
  ) {
    errors.push('Jede bestehende Aufgabe muss genau einmal enthalten sein.');
  }
  if (result.availabilityFrom < source.now || result.availabilityFrom > source.dayEnd)
    errors.push('Die früheste Verfügbarkeit ist ungültig.');
  const items = source.items.map((item) => {
    const placement = placements.get(item.id);
    if (!placement) return item;
    const started = item.start !== null && item.start < source.now;
    if (
      (item.fixed || started) &&
      placement.start !== item.start &&
      (started || !movedIds.has(item.id))
    )
      errors.push(`„${item.title}“ darf nicht verschoben werden.`);
    if (!started && placement.start !== null && placement.start < result.availabilityFrom)
      errors.push(`„${item.title}“ liegt vor der Verfügbarkeit.`);
    if (!started && placement.start === null && item.deadline !== null)
      errors.push(`„${item.title}“ hat heute eine Frist und darf nicht entfallen.`);
    if (
      !started &&
      item.start !== null &&
      item.category === 'recovery' &&
      result.energy === 'low' &&
      placement.start === null &&
      !item.tags.some((tag) => request.checkIn.exclusions.includes(tag))
    ) {
      errors.push(
        `„${item.title}“ ist eine eingeplante Erholungspause und soll bei wenig Energie erhalten bleiben.`,
      );
    }
    if (
      !started &&
      !item.fixed &&
      placement.start !== null &&
      item.tags.some((tag) => request.checkIn.exclusions.includes(tag))
    ) {
      errors.push(`„${item.title}“ widerspricht einem ausdrücklichen Ausschluss.`);
    }
    return { ...item, start: placement.start };
  });
  const proposedPlan = { ...source, availableFrom: result.availabilityFrom, items };
  errors.push(...validatePlan(proposedPlan));
  if (errors.length) throw new Error(errors.join(' '));
  return proposedPlan;
}
