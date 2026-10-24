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
  energyLabels,
  moodLabels,
  stressLabels,
  sleepQualityLabels,
  type CheckIn,
  type Energy,
  type Plan,
} from '../../../shared/contracts';

export const energyLevels: Energy[] = ['low', 'medium', 'high'];
export const moodIcons = [Sad02Icon, Sad01Icon, NeutralIcon, SmileIcon, HappyIcon];
export const exclusionOptions = [
  { id: 'coffee', label: 'Kein Kaffee', icon: Coffee01Icon },
  { id: 'running', label: 'Kein Joggen', icon: RunningShoesIcon },
  { id: 'gym', label: 'Kein Gym', icon: Dumbbell01Icon },
] as const;
export const productiveTimeLabels: Record<CheckIn['productiveTime'], string> = {
  morning: 'Vormittags',
  afternoon: 'Nachmittags',
  any: 'Egal wann',
};

export const formatHours = (hours: number) =>
  `${hours.toLocaleString('de-DE', { maximumFractionDigits: 1 })}\u00a0Std.`;

export const sleepVerdict = (hours: number) =>
  hours < 5 ? 'Sehr kurz' : hours < 6.5 ? 'Etwas knapp' : hours <= 9 ? 'Solide' : 'Ausgeschlafen';

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
    energy: energyLabels[checkIn.energy],
    mood: moodLabels[checkIn.mood - 1],
    stress: stressLabels[checkIn.stress - 1],
    focus: focus?.title ?? 'Noch kein Fokus',
    preferences: [
      productiveTimeLabels[checkIn.productiveTime],
      checkIn.exclusions.length === 1 ? '1 Ausschluss' : `${checkIn.exclusions.length} Ausschlüsse`,
    ].join(' · '),
  };
}

/** The sentence sent to the planner after the morning check-in. */
export function checkInMessage(checkIn: CheckIn, plan: Plan) {
  const summary = checkInSummary(checkIn, plan);
  const focus = plan.items.find((item) => item.id === checkIn.focusTaskId);
  return [
    `Mein Check-in von heute: ${formatHours(checkIn.sleepHours)} geschlafen (${sleepQualityLabels[checkIn.sleepQuality].toLowerCase()}),`,
    `Energie ${summary.energy.toLowerCase()}, Stimmung ${summary.mood.toLowerCase()}, Stress ${summary.stress.toLowerCase()}.`,
    focus ? `Mein Fokus heute: ${focus.title}.` : '',
    'Bitte passe meinen restlichen Tag daran an.',
  ]
    .filter(Boolean)
    .join(' ');
}
