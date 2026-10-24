import { z } from 'zod';

/** Real calendar days on this device, independent of the fixed demo day. */
const key = 'daylight.progress.v1';
const badgeIds = [
  'first-check-in',
  'early-bird',
  'streak-3',
  'streak-7',
  'first-plan',
  'plans-5',
] as const;
export type BadgeId = (typeof badgeIds)[number];

const progressSchema = z.object({
  version: z.literal(1),
  checkInDays: z.array(z.iso.date()).max(400),
  acceptedPlans: z.number().int().min(0),
  badges: z.array(z.enum(badgeIds)),
});
export type Progress = z.infer<typeof progressSchema>;

export const badges: Record<BadgeId, { title: string; description: string }> = {
  'first-check-in': {
    title: 'First sunrise',
    description: 'You did your first check-in.',
  },
  'early-bird': { title: 'Early bird', description: 'You checked in before 9 a.m.' },
  'streak-3': { title: 'Three days of light', description: 'You checked in three days in a row.' },
  'streak-7': { title: 'A week of light', description: 'You checked in seven days in a row.' },
  'first-plan': {
    title: 'Rearranged',
    description: 'You applied your first updated plan.',
  },
  'plans-5': { title: 'Flexible mind', description: 'You applied five updated plans.' },
};
export const badgeOrder = badgeIds;

export const localDay = (date = new Date()) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');

const previousDay = (day: string) => {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return localDay(date);
};

export const freshProgress = (): Progress => ({
  version: 1,
  checkInDays: [],
  acceptedPlans: 0,
  badges: [],
});

export function loadProgress(): Progress {
  try {
    const parsed = progressSchema.safeParse(JSON.parse(localStorage.getItem(key) || 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    /* Storage may be unavailable; progress then lives only in this tab. */
  }
  return freshProgress();
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    /* See loadProgress. */
  }
}

/** Consecutive check-in days ending today, or yesterday while today is still open. */
export function streak(progress: Progress, today = localDay()) {
  const days = new Set(progress.checkInDays);
  let day = days.has(today) ? today : previousDay(today);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = previousDay(day);
  }
  return count;
}

export const checkedInToday = (progress: Progress, today = localDay()) =>
  progress.checkInDays.includes(today);

export function nextStreakGoal(count: number) {
  return count < 3 ? 3 : count < 7 ? 7 : Math.ceil((count + 1) / 7) * 7;
}

function award(progress: Progress, earned: BadgeId[]) {
  const unlocked = earned.filter((id) => !progress.badges.includes(id));
  return { progress: { ...progress, badges: [...progress.badges, ...unlocked] }, unlocked };
}

export function recordCheckIn(progress: Progress, now = new Date()) {
  const today = localDay(now);
  const next = progress.checkInDays.includes(today)
    ? progress
    : { ...progress, checkInDays: [...progress.checkInDays, today].slice(-400) };
  const count = streak(next, today);
  const earned: BadgeId[] = ['first-check-in'];
  if (now.getHours() < 9) earned.push('early-bird');
  if (count >= 3) earned.push('streak-3');
  if (count >= 7) earned.push('streak-7');
  return award(next, earned);
}

export function recordAcceptedPlan(progress: Progress) {
  const next = { ...progress, acceptedPlans: progress.acceptedPlans + 1 };
  const earned: BadgeId[] = ['first-plan'];
  if (next.acceptedPlans >= 5) earned.push('plans-5');
  return award(next, earned);
}
