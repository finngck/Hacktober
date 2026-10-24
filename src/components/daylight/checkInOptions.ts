import {
  Sad02Icon,
  Sad01Icon,
  NeutralIcon,
  SmileIcon,
  HappyIcon,
  Coffee01Icon,
  RunningShoesIcon,
  Dumbbell01Icon,
} from '@hugeicons/core-free-icons';
import {
  energyLevelLabels,
  energyLevelOf,
  moodLabels,
  stressLabels,
  sleepQualityLabels,
  type CheckIn,
  type Plan,
} from '../../../shared/contracts';

export const moodIcons = [Sad02Icon, Sad01Icon, NeutralIcon, SmileIcon, HappyIcon];
export const exclusionOptions = [
  { id: 'coffee', label: 'No coffee', icon: Coffee01Icon },
  { id: 'running', label: 'No running', icon: RunningShoesIcon },
  { id: 'gym', label: 'No gym', icon: Dumbbell01Icon },
] as const;
export const productiveTimeLabels: Record<CheckIn['productiveTime'], string> = {
  morning: 'Mornings',
  afternoon: 'Afternoons',
  any: 'Any time',
};

export const formatHours = (hours: number) =>
  `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })}\u00a0h`;

export const sleepVerdict = (hours: number) =>
  hours < 5 ? 'Very short' : hours < 6.5 ? 'A bit short' : hours <= 9 ? 'Solid' : 'Well rested';

/** Open check-in controls on the value itself, so arrow keys work right away. */
export const firstControl = (container: HTMLElement | null) =>
  container?.querySelector<HTMLElement>(
    'input[type=range], [role=radio][aria-checked=true], [data-pressed]',
  ) ?? true;

/** Flexible tasks that are still ahead today can become the focus. */
export const focusCandidates = (plan: Plan) =>
  plan.items.filter((item) => !item.fixed && (item.start === null || item.start >= plan.now));

export function checkInSummary(checkIn: CheckIn, plan: Plan) {
  const focus = plan.items.find((item) => item.id === checkIn.focusTaskId);
  return {
    sleep: `${formatHours(checkIn.sleepHours)} · ${sleepQualityLabels[checkIn.sleepQuality]}`,
    energy: energyLevelLabels[energyLevelOf(checkIn) - 1],
    mood: moodLabels[checkIn.mood - 1],
    stress: stressLabels[checkIn.stress - 1],
    focus: focus?.title ?? 'No focus yet',
    preferences: [
      productiveTimeLabels[checkIn.productiveTime],
      checkIn.exclusions.length === 1 ? '1 exclusion' : `${checkIn.exclusions.length} exclusions`,
    ].join(' · '),
  };
}

/** The sentence sent to the planner after the morning check-in. */
export function checkInMessage(checkIn: CheckIn, plan: Plan) {
  const summary = checkInSummary(checkIn, plan);
  const focus = plan.items.find((item) => item.id === checkIn.focusTaskId);
  return [
    `My check-in today: slept ${formatHours(checkIn.sleepHours)} (${sleepQualityLabels[checkIn.sleepQuality].toLowerCase()}),`,
    `energy ${summary.energy.toLowerCase()}, mood ${summary.mood.toLowerCase()}, stress ${summary.stress.toLowerCase()}.`,
    focus ? `My focus today: ${focus.title}.` : '',
    'Please adjust the rest of my day accordingly.',
  ]
    .filter(Boolean)
    .join(' ');
}
