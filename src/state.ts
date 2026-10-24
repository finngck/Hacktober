import { z } from 'zod';
import { checkInSchema, planSchema, validatePlan } from '../shared/contracts';
import { demoCheckIn, demoPlan } from '../shared/demo';

const snapshotSchema = z.object({ plan: planSchema, checkIn: checkInSchema });
const stateSchema = snapshotSchema.extend({
  version: z.literal(1),
  history: z.array(snapshotSchema).max(5),
  tipsDismissedOn: z.iso.date().nullable().default(null),
});
export type Workspace = z.infer<typeof stateSchema>;
const key = 'daylight.workspace.v1';

export const freshWorkspace = (): Workspace =>
  structuredClone({
    version: 1,
    plan: demoPlan,
    checkIn: demoCheckIn,
    history: [],
    tipsDismissedOn: null,
  });

export function loadWorkspace(): Workspace {
  try {
    const parsed = stateSchema.safeParse(JSON.parse(localStorage.getItem(key) || 'null'));
    if (
      parsed.success &&
      [parsed.data, ...parsed.data.history].every((snapshot) => !validatePlan(snapshot.plan).length)
    )
      return parsed.data;
  } catch {
    /* Unavailable or corrupt storage falls back to the synthetic example. */
  }
  return freshWorkspace();
}

export function saveWorkspace(workspace: Workspace): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}
