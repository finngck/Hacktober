import { z } from 'zod';
import {
  energySchema,
  itemSchema,
  type ReplanRequest,
  type ScheduleItem,
} from '../shared/contracts.js';
import type { PlanningIntent } from './scheduler.js';

// The model selects operations; only this allowlist can change a proposal.
const source = z
  .string()
  .trim()
  .min(3)
  .max(2000)
  .describe('Exact quote from message authorizing this operation.');
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
      'Edit an existing flexible future task explicitly identified by the user, preserving its ID and other fields. Automatically reserves it. Never change fixed/begun tasks, remove deadlines, or replace an unrelated subject.',
    args: z.strictObject({ id, patch, source }),
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
      'Change availability, energy or sleep ONLY when explicitly changed in message. Omit unchanged fields. Times are minutes after midnight: 14:00=840. Relative delays add to plan.availableFrom.',
    args: z.strictObject({
      availabilityFrom: z.number().int().min(0).max(1440).optional(),
      energy: energySchema.optional(),
      sleepHours: z.number().min(0).max(16).optional(),
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
  const intent: PlanningIntent = {
    status: 'ready',
    summary: '',
    availabilityFrom: request.plan.availableFrom,
    energy: request.checkIn.energy,
    sleepHours: request.checkIn.sleepHours,
    question: null,
    taskOrder: [],
    focusIds: [],
    deferIds: [],
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
    if ('source' in call.args && !request.message.includes(call.args.source))
      throw new Error(`${call.name}: source muss ein wörtliches Zitat aus message sein.`);
  }
  const edited = new Set<string>();
  const focus = new Set<string>();
  const findMutable = (taskId: string) => {
    const task = prepared.plan.items.find((item) => item.id === taskId);
    if (!task) throw new Error(`Unbekannte Aufgaben-ID: ${taskId}.`);
    if (task.fixed || (task.start !== null && task.start < request.plan.now))
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
    if (call.name === 'update_task') {
      const task = findMutable(call.args.id);
      if (edited.has(task.id) || focus.has(task.id))
        throw new Error('Eine Aufgabe darf pro Vorschlag nur einmal bearbeitet werden.');
      if (
        task.deadline !== null &&
        call.args.patch.deadline !== undefined &&
        call.args.patch.deadline !== task.deadline
      )
        throw new Error('Eine heutige Frist darf nicht entfernt oder verändert werden.');
      Object.assign(task, call.args.patch);
      edited.add(task.id);
      focus.add(task.id);
    }
  }
  if (prepared.plan.items.length > 40)
    throw new Error('Der Tagesplan unterstützt maximal 40 Aufgaben.');
  let contextUpdated = false;
  for (const call of calls) {
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
      if (contextUpdated) throw new Error('Bündle Änderungen des Tageskontexts in einem Aufruf.');
      contextUpdated = true;
      const { source: _source, ...context } = call.args;
      if (!Object.keys(context).length)
        throw new Error('update_day_context braucht mindestens eine Änderung.');
      Object.assign(intent, context);
    }
  }
  if (intent.availabilityFrom < request.plan.now)
    throw new Error('availabilityFrom muss ab plan.now liegen, in Minuten nach Mitternacht.');
  if (intent.deferIds.some((taskId) => focus.has(taskId)))
    throw new Error(
      'Eine angeforderte Aufgabe kann nicht gleichzeitig priorisiert und zurückgestellt werden.',
    );
  intent.focusIds = [...focus];
  intent.taskOrder = [...new Set([...intent.taskOrder, ...focus])];
  return { request: prepared, intent };
}
