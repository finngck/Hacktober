import { formatTime, replanResponseSchema, validatePlan } from '../shared/contracts';
import type { Workspace } from './state';

export function describeDay(workspace: Workspace) {
  return {
    date: workspace.plan.date,
    now: formatTime(workspace.plan.now),
    availableFrom: formatTime(workspace.plan.availableFrom),
    checkIn: workspace.checkIn,
    items: workspace.plan.items.map((item) => ({
      ...item,
      time: item.start === null ? 'open today' : formatTime(item.start),
    })),
  };
}

export async function executeVoiceReplan(
  message: string,
  dependencies: {
    read: () => Workspace;
    request: (workspace: Workspace, message: string) => Promise<unknown>;
    commit: (workspace: Workspace) => void;
    showResult: (response: ReturnType<typeof replanResponseSchema.parse>) => void;
    showApplied?: (response: ReturnType<typeof replanResponseSchema.parse>) => void;
    signal: AbortSignal;
  },
) {
  const source = structuredClone(dependencies.read());
  const snapshot = JSON.stringify(source);
  const response = replanResponseSchema.parse(await dependencies.request(source, message));
  if (dependencies.signal.aborted)
    return {
      status: 'error',
      summary: 'Planning was canceled. Nothing was applied.',
    };
  if (JSON.stringify(dependencies.read()) !== snapshot)
    return {
      status: 'stale',
      summary: 'The day plan changed in the meantime. Please plan again.',
    };
  if (response.result.status !== 'proposal' || !response.proposedPlan) {
    dependencies.showResult(response);
    return {
      status: response.result.status,
      summary: response.result.summary,
      question: response.result.question,
    };
  }
  const issues = validatePlan(response.proposedPlan);
  if (issues.length) throw new Error("Couldn't validate the new day plan.");
  const changes = response.proposedPlan.items.flatMap((item) => {
    const before = source.plan.items.find((candidate) => candidate.id === item.id);
    if (
      before &&
      before.start === item.start &&
      before.duration === item.duration &&
      before.title === item.title
    )
      return [];
    return [
      {
        title: item.title,
        before: before
          ? before.start === null
            ? 'open today'
            : formatTime(before.start)
          : 'new task',
        after: item.start === null ? 'open today' : formatTime(item.start),
        reason:
          response.result.placements.find((placement) => placement.id === item.id)?.reason ?? '',
      },
    ];
  });
  const next: Workspace = {
    ...source,
    plan: response.proposedPlan,
    checkIn: {
      ...source.checkIn,
      energy: response.result.energy,
      energyLevel: response.result.energyLevel,
      sleepHours: response.result.sleepHours,
    },
    history: [...source.history, { plan: source.plan, checkIn: source.checkIn }].slice(-5),
  };
  dependencies.commit(next);
  dependencies.showApplied?.(response);
  return { status: 'applied', summary: response.result.summary, changes, plan: describeDay(next) };
}
