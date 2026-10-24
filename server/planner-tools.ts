import { z } from 'zod';
import {
  energySchema,
  hasItemChanged,
  itemSchema,
  type ReplanRequest,
  type ScheduleItem,
} from '../shared/contracts.js';
import type { PlanningIntent } from './scheduler.js';
import { signalsSchema } from '../shared/measures.js';
import { explicitLowEnergy } from './explicit-energy.js';

// The model selects operations; only this allowlist can change a proposal.
const source = z
  .string()
  .trim()
  .min(3)
  .max(2000)
  .describe(
    'Exact quote from a USER message: current message OR conversation[].message. Never quote an assistant reply.',
  );
const id = z.string().min(1).max(80);
const ids = z.array(id).min(1).max(40);
const patch = itemSchema
  .pick({
    title: true,
    category: true,
    duration: true,
    priority: true,
    effort: true,
    deadline: true,
    tags: true,
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Eine Bearbeitung braucht geänderte Felder.');

export const taskBricks = {
  exam_prep: { category: 'study', duration: 90, priority: 'high', effort: 'high', tags: [] },
  focus_work: { category: 'work', duration: 60, priority: 'medium', effort: 'high', tags: [] },
  small_task: { category: 'work', duration: 30, priority: 'low', effort: 'low', tags: [] },
  recovery: { category: 'recovery', duration: 15, priority: 'medium', effort: 'low', tags: [] },
  gym: { category: 'movement', duration: 45, priority: 'low', effort: 'high', tags: ['gym'] },
  social: { category: 'social', duration: 60, priority: 'medium', effort: 'low', tags: [] },
} satisfies Record<
  string,
  Pick<ScheduleItem, 'category' | 'duration' | 'priority' | 'effort' | 'tags'>
>;

const toolDefinitions = {
  create_task: {
    description:
      'Add a genuinely new task requested in message. Automatically reserves time ahead of optional work. Use a brick default when duration is unspecified. Never rename a different subject to avoid creating a task.',
    args: z.strictObject({
      id: z.string().regex(/^new-[a-z0-9-]{1,60}$/),
      brick: z.enum(['exam_prep', 'focus_work', 'small_task', 'recovery', 'gym', 'social']),
      title: itemSchema.shape.title,
      duration: itemSchema.shape.duration.optional(),
      deadline: itemSchema.shape.deadline
        .optional()
        .describe(
          'Only an explicitly stated deadline TODAY, in minutes after midnight. Tomorrow is not a deadline today.',
        ),
      source,
    }),
  },
  update_task: {
    description:
      'Edit an existing flexible task explicitly identified by the user. For an absolute total duration use patch.duration; for longer/shorter use adjust_task_duration. A currently running flexible task permits ONLY duration edits, keeping its start and elapsed time. Never edit fixed/completed tasks, remove deadlines, or replace an unrelated subject.',
    args: z.strictObject({ id, patch, source }),
  },
  adjust_task_duration: {
    description:
      'Make an existing flexible future or currently running task longer/shorter by changeMinutes. The server adds this to its current duration. For "länger", "mehr Zeit" or "langsamer angehen" without a quantity OMIT changeMinutes: the proposal adds 30 minutes. Negative values shorten a task. Never use prioritize_tasks alone for a duration change. Fixed and completed tasks cannot be resized.',
    args: z.strictObject({
      id,
      changeMinutes: z.number().int().min(-480).max(480).optional(),
      source,
    }),
  },
  move_task: {
    description:
      'Move an existing future task, including a fixed appointment, ONLY on explicit user request. Provide either the absolute start in minutes after midnight or a relative shiftMinutes; set the other to null. Never move an appointment to optimize the plan. Begun tasks stay locked.',
    args: z
      .strictObject({
        id,
        start: itemSchema.shape.start,
        shiftMinutes: z.number().int().min(-1440).max(1440).nullable(),
        source,
      })
      .refine(
        (value) => (value.start === null) !== (value.shiftMinutes === null),
        'Setze genau eine von start oder shiftMinutes, die andere auf null.',
      ),
  },
  prioritize_tasks: {
    description:
      'Reserve existing requested tasks before optional work, in priority order. Use for a requested focus or exam already present. The scheduler only displaces other tasks if necessary.',
    args: z.strictObject({ ids, source }),
  },
  defer_tasks: {
    description:
      'Leave optional tasks open today ONLY when the user explicitly asks to skip those tasks. Do not call just to make room: create/prioritize already does that. Nothing is deleted or scheduled tomorrow.',
    args: z.strictObject({ ids, source }),
  },
  update_day_context: {
    description:
      'Report availability, energy, sleep or signals explicitly stated in the current OR earlier unresolved USER messages. "Keinen Kopf mehr" / "bin platt" / "erschöpft" report low energy. Report context together with duration changes, including after a clarification answer. Omit unknown signals and unchanged fields. Times are minutes after midnight: 14:00=840. Relative delays add to plan.availableFrom. The engine selects energy measures.',
    args: z.strictObject({
      availabilityFrom: z.number().int().min(0).max(1440).optional(),
      energy: energySchema.optional(),
      sleepHours: z.number().min(0).max(16).optional(),
      signals: signalsSchema
        .strict()
        .optional()
        .describe(
          'Report EVERY explicitly stated signal. "Ich nicke weg" / "Sekundenschlaf" means sekundenschlaf:true; "schläfrig" means schlaefrig:true. Omit only signals not mentioned. Never infer caffeine consumption.',
        ),
      source,
    }),
  },
  replan_day: {
    description:
      'Replan using existing tasks and check-in when no task/context edits are needed. Never substitutes for creating/updating/prioritizing a specifically requested task.',
    args: z.strictObject({}),
  },
  ask_clarification: {
    description:
      'Ask one concise German question if the target task is ambiguous or a decisive detail is missing. Must be the only call. Missing duration alone is not ambiguous: use a brick default.',
    args: z.strictObject({ question: z.string().trim().min(5).max(500) }),
  },
};

export const plannerToolDeclarations = Object.entries(toolDefinitions).map(([name, tool]) => {
  const { $schema: _schema, ...parametersJsonSchema } = z.toJSONSchema(tool.args);
  return { name, description: tool.description, parametersJsonSchema };
});

const callSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('create_task'), args: toolDefinitions.create_task.args }),
  z.strictObject({ name: z.literal('update_task'), args: toolDefinitions.update_task.args }),
  z.strictObject({
    name: z.literal('adjust_task_duration'),
    args: toolDefinitions.adjust_task_duration.args,
  }),
  z.strictObject({ name: z.literal('move_task'), args: toolDefinitions.move_task.args }),
  z.strictObject({
    name: z.literal('prioritize_tasks'),
    args: toolDefinitions.prioritize_tasks.args,
  }),
  z.strictObject({ name: z.literal('defer_tasks'), args: toolDefinitions.defer_tasks.args }),
  z.strictObject({
    name: z.literal('update_day_context'),
    args: toolDefinitions.update_day_context.args,
  }),
  z.strictObject({ name: z.literal('replan_day'), args: toolDefinitions.replan_day.args }),
  z.strictObject({
    name: z.literal('ask_clarification'),
    args: toolDefinitions.ask_clarification.args,
  }),
]);

export function prepareToolCalls(request: ReplanRequest, rawCalls: unknown) {
  // Validate the entire batch before touching a copy. A failed batch has no side effects.
  const calls = z.array(callSchema).min(1).max(20).parse(rawCalls);
  const prepared = structuredClone(request);
  const reportedEnergy = explicitLowEnergy(request);
  const intent: PlanningIntent = {
    status: 'ready',
    summary: '',
    availabilityFrom: request.plan.availableFrom,
    energy: reportedEnergy ?? request.checkIn.energy,
    sleepHours: request.checkIn.sleepHours,
    question: null,
    taskOrder: [],
    focusIds: [],
    deferIds: [],
    moves: [],
    reasons: [],
  };
  const question = calls.find((call) => call.name === 'ask_clarification');
  if (question) {
    if (calls.length !== 1) throw new Error('ask_clarification muss allein stehen.');
    intent.status = 'clarification';
    intent.question = question.args.question;
    intent.summary = 'Für einen passenden Vorschlag fehlt noch eine Angabe.';
    return { request: prepared, intent };
  }
  for (const call of calls) {
    if (!('source' in call.args)) continue;
    const evidence = call.args.source;
    if (
      ![request.message, ...(request.conversation ?? []).map((turn) => turn.message)].some(
        (message) => message.includes(evidence),
      )
    )
      throw new Error(`${call.name}: source muss ein wörtliches Zitat einer Nutzernachricht sein.`);
  }
  const edited = new Set<string>();
  const focus = new Set<string>();
  const findMutable = (taskId: string, allowRunningDuration = false) => {
    const task = prepared.plan.items.find((item) => item.id === taskId);
    if (!task) throw new Error(`Unbekannte Aufgaben-ID: ${taskId}.`);
    const started = task.start !== null && task.start < request.plan.now;
    const running = started && task.start! + task.duration > request.plan.now;
    if (task.fixed || (started && !(allowRunningDuration && running)))
      throw new Error(
        `„${task.title}“ ist fest oder bereits begonnen und darf nicht bearbeitet oder zurückgestellt werden.`,
      );
    return task;
  };
  // Add/edit first, so priority references can address new tasks in the same batch.
  for (const call of calls) {
    if (call.name === 'create_task') {
      const { id: taskId, brick, title, duration, deadline } = call.args;
      if (prepared.plan.items.some((item) => item.id === taskId))
        throw new Error(`Die Aufgaben-ID ${taskId} existiert bereits; nutze update_task.`);
      if (
        prepared.plan.items.some(
          (item) => item.title.toLocaleLowerCase('de') === title.toLocaleLowerCase('de'),
        )
      )
        throw new Error(
          'Diese Aufgabe existiert bereits; nutze prioritize_tasks oder update_task.',
        );
      prepared.plan.items.push(
        itemSchema.parse({
          ...taskBricks[brick],
          id: taskId,
          title,
          start: null,
          fixed: false,
          duration: duration ?? taskBricks[brick].duration,
          deadline: deadline ?? null,
        }),
      );
      focus.add(taskId);
    }
    if (call.name === 'update_task' || call.name === 'adjust_task_duration') {
      const durationOnly =
        call.name === 'adjust_task_duration' ||
        Object.keys(call.args.patch).every((key) => key === 'duration');
      const task = findMutable(call.args.id, durationOnly);
      if (edited.has(task.id) || focus.has(task.id))
        throw new Error('Eine Aufgabe darf pro Vorschlag nur einmal bearbeitet werden.');
      const changes =
        call.name === 'adjust_task_duration'
          ? { duration: task.duration + (call.args.changeMinutes ?? 30) }
          : call.args.patch;
      if (
        task.deadline !== null &&
        changes.deadline !== undefined &&
        changes.deadline !== task.deadline
      )
        throw new Error('Eine heutige Frist darf nicht entfernt oder verändert werden.');
      const updated = itemSchema.parse({ ...task, ...changes });
      if (
        task.start !== null &&
        task.start < request.plan.now &&
        task.start + updated.duration < request.plan.now
      )
        throw new Error('Die neue Dauer darf bereits verstrichene Arbeitszeit nicht entfernen.');
      if (!hasItemChanged(task, updated))
        throw new Error(
          'Die Aufgabe bleibt unverändert. Nutze für mehr Zeit adjust_task_duration.',
        );
      Object.assign(task, updated);
      edited.add(task.id);
      focus.add(task.id);
    }
  }
  if (prepared.plan.items.length > 40)
    throw new Error('Der Tagesplan unterstützt maximal 40 Aufgaben.');
  const reportedContext = new Map<string, unknown>();
  const recordContext = (key: string, value: unknown) => {
    if (reportedContext.has(key) && reportedContext.get(key) !== value)
      throw new Error(
        `Widersprüchliche Angaben für ${key}; melde pro Feld einen eindeutigen Wert.`,
      );
    reportedContext.set(key, value);
  };
  for (const call of calls) {
    if (call.name === 'move_task') {
      const { id: taskId, start, shiftMinutes } = call.args;
      const task = request.plan.items.find((item) => item.id === taskId);
      if (!task) throw new Error(`Unbekannte Aufgaben-ID: ${taskId}.`);
      if (task.start !== null && task.start < request.plan.now)
        throw new Error(`„${task.title}“ hat bereits begonnen und darf nicht verschoben werden.`);
      if (intent.moves!.some((move) => move.id === taskId))
        throw new Error('Eine Aufgabe darf pro Vorschlag nur einmal verschoben werden.');
      intent.moves!.push({ id: taskId, start, shiftMinutes });
    }
    if (call.name === 'prioritize_tasks') {
      for (const taskId of call.args.ids) {
        findMutable(taskId);
        intent.taskOrder.push(taskId);
        focus.add(taskId);
      }
    }
    if (call.name === 'defer_tasks') {
      for (const taskId of call.args.ids) {
        const task = findMutable(taskId);
        if (task.deadline !== null)
          throw new Error('Aufgaben mit heutiger Frist dürfen nicht zurückgestellt werden.');
        intent.deferIds.push(taskId);
      }
    }
    if (call.name === 'update_day_context') {
      const { source: _source, signals, ...context } = call.args;
      if (!Object.keys(context).length && !Object.keys(signals ?? {}).length)
        throw new Error('update_day_context braucht mindestens eine Änderung.');
      for (const [key, value] of Object.entries(context)) recordContext(key, value);
      for (const [key, value] of Object.entries(signals ?? {}))
        recordContext(`signals.${key}`, value);
      Object.assign(intent, context);
      if (signals) intent.signals = { ...intent.signals, ...signals };
    }
  }
  // A plainly stated user fact takes precedence over an omitted or unchanged
  // model context field. A newer correction is excluded by explicitLowEnergy.
  if (reportedEnergy) intent.energy = reportedEnergy;
  if (intent.availabilityFrom < request.plan.now)
    throw new Error('availabilityFrom muss ab plan.now liegen, in Minuten nach Mitternacht.');
  if (
    intent.deferIds.some(
      (taskId) => focus.has(taskId) || intent.moves!.some((move) => move.id === taskId),
    )
  )
    throw new Error(
      'Eine angeforderte Aufgabe kann nicht gleichzeitig priorisiert und zurückgestellt werden.',
    );
  intent.focusIds = [...focus];
  intent.taskOrder = [...new Set([...intent.taskOrder, ...focus])];
  return { request: prepared, intent };
}
