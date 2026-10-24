import { z } from 'zod';
import type { Energy, Plan, ReplanRequest } from './contracts.js';

export const measureTypeSchema = z.enum(['massnahme', 'massgabe', 'restriktion']);
export const measureSchema = z.object({
  id: z.string().min(1).max(60),
  type: measureTypeSchema,
  title: z.string().min(1).max(120),
  text: z.string().min(1).max(400),
  hint: z.string().max(300).nullable(),
});
export const energyMeasuresSchema = z.object({
  actions: z.array(measureSchema).max(3),
  restrictions: z.array(measureSchema).max(2),
});

/** Only what the user explicitly said in their message; Gemma omits unknown keys. */
export const signalsSchema = z
  .object({
    schlaefrig: z.boolean(),
    hunger: z.boolean(),
    sekundenschlaf: z.boolean(),
    nachNap: z.boolean(),
    trinktRegelmaessigKaffee: z.boolean(),
    koffeinHeuteMg: z.number().int().min(0).max(2000),
  })
  .partial();

export type Measure = z.infer<typeof measureSchema>;
export type EnergyMeasures = z.infer<typeof energyMeasuresSchema>;
export type Signals = z.infer<typeof signalsSchema>;

/** Unknown values stay undefined, so conditions using them are not met. */
export type MeasureContext = Signals & {
  minSeitAufwachen: number;
  stdBisSchlafenszeit: number;
  spaetAufgewacht: boolean;
  energietief: boolean;
  extremErschoepft: boolean;
  massiverSchlafmangel: boolean;
  fitFuerSport: boolean;
  nachMittagessen: boolean;
  mussDanachLeistungsfaehig: boolean;
  freieZeitMin: number;
};

type Block = {
  id: string;
  type: Measure['type'];
  title: string;
  text: string;
  hint?: string;
  priority: 1 | 2 | 3;
  core?: boolean;
  /** Dropped entirely when the user excludes this activity in the check-in. */
  exclusion?: 'coffee' | 'running';
  /** Without a condition, the block always applies. */
  when?: (c: MeasureContext) => boolean;
  /** Other blocks this active block removes. */
  blocks?: string[];
};

const CAFFEINE_MAX_MG = 400;
const MIN_DOSE_MG = 50;
const CAFFEINE_CUTOFF_H = 8;
const NAP_CUTOFF_H = 8;
const caffeineLeft = (c: MeasureContext) =>
  c.koffeinHeuteMg !== undefined && c.koffeinHeuteMg + MIN_DOSE_MG <= CAFFEINE_MAX_MG;
const napAllowed = (c: MeasureContext) => c.stdBisSchlafenszeit >= NAP_CUTOFF_H;
const sleepy = (c: MeasureContext) => c.schlaefrig ?? c.energietief;

// Source: measure pool "More energy after poor sleep".
export const measureBlocks: Block[] = [
  // Right after waking up
  {
    id: 'AUF_WASSER',
    type: 'massnahme',
    title: 'Drink water',
    text: 'Drink 500 ml of water right after waking up.',
    priority: 1,
    when: (c) => c.minSeitAufwachen <= 30,
  },
  {
    id: 'AUF_TAGESLICHT',
    type: 'massnahme',
    title: 'Get some daylight',
    text: 'Within the first 30 minutes, head outside into daylight for 10–20 minutes.',
    priority: 1,
    when: (c) => c.minSeitAufwachen <= 30,
  },
  {
    id: 'AUF_SPAZIEREN',
    type: 'massnahme',
    title: 'Take a brisk walk instead of lying down',
    text: 'Take a brisk 5–10 minute walk instead of lying back down.',
    priority: 2,
    when: (c) => c.minSeitAufwachen <= 60,
  },
  {
    id: 'AUF_FRUEHSTUECK_OPTIONAL',
    type: 'massgabe',
    title: 'Don’t force breakfast',
    text: 'If you’re not hungry, you don’t have to eat breakfast.',
    priority: 3,
    when: (c) => c.hunger === false && c.minSeitAufwachen <= 90,
  },

  // If you woke up late
  {
    id: 'SPAET_KEIN_NACHHOLEN',
    type: 'restriktion',
    title: 'Don’t make up for the morning',
    text: 'Don’t try to catch up on your full morning routine. Start straight away with light, water and your most important tasks.',
    priority: 1,
    when: (c) => c.spaetAufgewacht,
  },
  {
    id: 'SPAET_ERSTE_15_MIN',
    type: 'massnahme',
    title: 'Quick start in 15 minutes',
    text: 'In the first 15 minutes: drink water, get into the light, move a little.',
    priority: 1,
    when: (c) => c.spaetAufgewacht && c.minSeitAufwachen <= 15,
    blocks: ['AUF_WASSER', 'AUF_TAGESLICHT', 'AUF_SPAZIEREN'],
  },
  {
    id: 'SPAET_WICHTIGE_AUFGABE',
    type: 'massnahme',
    title: 'Start with an important task',
    text: 'Start straight away with an important task and work on it for 25–50 minutes at a stretch.',
    priority: 1,
    when: (c) => c.spaetAufgewacht && c.minSeitAufwachen > 15 && c.minSeitAufwachen <= 120,
  },
  {
    id: 'SPAET_PRIORISIEREN',
    type: 'massgabe',
    title: 'Important things first, drop the rest',
    text: 'Do your most important tasks first and drop unimportant ones for today.',
    priority: 2,
    when: (c) => c.spaetAufgewacht,
  },

  // Caffeine
  {
    id: 'KOF_ERSTE_DOSIS',
    type: 'massnahme',
    title: 'First caffeine dose',
    text: 'Have a first dose of 50–100 mg of caffeine once you’re up and need it. If you drink coffee regularly, about 80–100 mg makes sense.',
    priority: 2,
    exclusion: 'coffee',
    when: (c) => c.koffeinHeuteMg === 0 && c.stdBisSchlafenszeit >= CAFFEINE_CUTOFF_H,
  },
  {
    id: 'KOF_NACHDOSIS',
    type: 'massnahme',
    title: 'Top-up for another dip',
    text: 'If your energy dips again, you can have another 50–100 mg of caffeine after about 2–3 hours.',
    priority: 2,
    exclusion: 'coffee',
    when: (c) =>
      c.energietief &&
      c.koffeinHeuteMg !== undefined &&
      c.koffeinHeuteMg > 0 &&
      caffeineLeft(c) &&
      c.stdBisSchlafenszeit >= CAFFEINE_CUTOFF_H,
  },
  {
    id: 'KOF_TAGESMAXIMUM',
    type: 'restriktion',
    title: 'Daily caffeine limit',
    text: 'Keep your daily total to 400 mg of caffeine at most, and well below that if you’re sensitive to caffeine.',
    hint: 'This limit applies to healthy adults.',
    priority: 1,
    exclusion: 'coffee',
    when: (c) => c.koffeinHeuteMg !== undefined && !caffeineLeft(c),
    blocks: ['KOF_ERSTE_DOSIS', 'KOF_NACHDOSIS', 'NAP_KOFFEIN'],
  },
  {
    id: 'KOF_CUTOFF',
    type: 'restriktion',
    title: 'Caffeine cutoff before bed',
    text: 'No more caffeine once you’re less than 8 hours from your planned bedtime.',
    priority: 1,
    core: true,
    exclusion: 'coffee',
    when: (c) => c.stdBisSchlafenszeit < CAFFEINE_CUTOFF_H,
  },
  {
    id: 'KOF_SPAET_VERZICHT',
    type: 'restriktion',
    title: 'Woke up late: skip caffeine',
    text: 'If you only woke up in the late afternoon, skip caffeine if it could disrupt your night’s sleep.',
    priority: 2,
    exclusion: 'coffee',
    when: (c) => c.spaetAufgewacht && c.stdBisSchlafenszeit < CAFFEINE_CUTOFF_H,
  },
  {
    id: 'KOF_NICHT_UEBERDECKEN',
    type: 'restriktion',
    title: 'Don’t mask microsleep with caffeine',
    text: 'If you’re nodding off, don’t try to cover it up with caffeine. Sleep comes first.',
    priority: 1,
    when: (c) => c.sekundenschlaf === true,
    blocks: ['KOF_ERSTE_DOSIS', 'KOF_NACHDOSIS', 'NAP_KOFFEIN'],
  },
  {
    id: 'KOF_ERST_BEWEGUNG',
    type: 'massgabe',
    title: 'Move first, then coffee',
    text: 'If you’re tired after lunch, take a 10-minute walk before reaching for more coffee.',
    priority: 2,
    exclusion: 'coffee',
    when: (c) => c.nachMittagessen && sleepy(c) && c.stdBisSchlafenszeit >= CAFFEINE_CUTOFF_H,
  },

  // Tactical Nap
  {
    id: 'NAP_KURZ',
    type: 'massnahme',
    title: 'Tactical nap',
    text: 'Take a nap with 10–20 minutes of actual sleep. Set an alarm for 20–25 minutes so you have time to fall asleep.',
    priority: 1,
    core: true,
    when: (c) => sleepy(c) && napAllowed(c) && c.freieZeitMin >= 25,
  },
  {
    id: 'NAP_ZEITFENSTER',
    type: 'massgabe',
    title: 'Best time for a nap',
    text: 'The best time for a nap is roughly between 1 and 3 pm.',
    priority: 3,
    when: (c) => sleepy(c) && napAllowed(c),
  },
  {
    id: 'NAP_NUR_WENN_SCHLAEFRIG',
    type: 'massgabe',
    title: 'Nap only when truly sleepy',
    text: 'Only plan a nap if you’re really sleepy and it won’t push back your night’s sleep.',
    priority: 3,
    when: (c) => c.schlaefrig === undefined && c.energietief && napAllowed(c),
  },
  {
    id: 'NAP_ABSTAND_SCHLAF',
    type: 'restriktion',
    title: 'No nap close to bedtime',
    text: 'Avoid napping in the last 6–8 hours before your planned bedtime if it affects your night’s sleep.',
    priority: 1,
    when: (c) => sleepy(c) && !napAllowed(c),
    blocks: ['NAP_KURZ', 'NAP_KOFFEIN', 'NAP_LANG'],
  },
  {
    id: 'NAP_DANACH_AKTIVIEREN',
    type: 'massnahme',
    title: 'Get going after the nap',
    text: 'After the nap, spend 5–10 minutes in daylight or get moving.',
    priority: 1,
    when: (c) => c.nachNap === true,
  },
  {
    id: 'NAP_KOFFEIN',
    type: 'massnahme',
    title: 'Coffee nap (optional)',
    text: 'Optional: drink a coffee right before your nap. It kicks in around the time you wake up.',
    hint: 'Counts toward your daily caffeine limit.',
    priority: 3,
    exclusion: 'coffee',
    when: (c) =>
      sleepy(c) &&
      c.trinktRegelmaessigKaffee === true &&
      caffeineLeft(c) &&
      napAllowed(c) &&
      c.freieZeitMin >= 25,
  },
  {
    id: 'NAP_KEIN_MITTELLANG',
    type: 'restriktion',
    title: 'No 45–60 minute naps',
    text: 'Avoid 45–60 minute naps if you need to perform soon afterwards – the risk of grogginess is higher.',
    priority: 2,
    when: (c) => sleepy(c) && c.mussDanachLeistungsfaehig,
  },
  {
    id: 'NAP_LANG',
    type: 'massnahme',
    title: 'A long nap as an alternative',
    text: 'If you’re extremely exhausted and have plenty of time, a nap of about 90 minutes can be an alternative.',
    hint: 'It isn’t guaranteed to be a full sleep cycle.',
    priority: 3,
    when: (c) =>
      c.extremErschoepft && c.freieZeitMin >= 100 && !c.mussDanachLeistungsfaehig && napAllowed(c),
  },

  // Movement as a pick-me-up
  {
    id: 'BEW_ENERGIETIEF',
    type: 'massnahme',
    title: 'Brisk walk during an energy dip',
    text: 'When your energy crashes, walk briskly for 5–10 minutes.',
    priority: 1,
    core: true,
    when: (c) => c.energietief,
  },
  {
    id: 'BEW_NACH_MITTAG',
    type: 'massnahme',
    title: 'Walk after lunch',
    text: 'Take a 10–20 minute walk after lunch.',
    priority: 2,
    when: (c) => c.nachMittagessen,
  },
  {
    id: 'BEW_TREPPE_RAD',
    type: 'massnahme',
    title: 'Climb stairs or cycle easy',
    text: 'If you feel sleepy, climb stairs or cycle at an easy pace for 10 minutes.',
    priority: 2,
    when: (c) => sleepy(c),
  },
  {
    id: 'BEW_JOGGEN',
    type: 'massnahme',
    title: 'Easy jog',
    text: 'If you feel up to it, go for an easy 20–30 minute jog.',
    priority: 3,
    exclusion: 'running',
    when: (c) => c.fitFuerSport && !c.massiverSchlafmangel,
  },
  {
    id: 'BEW_KEIN_HIIT',
    type: 'restriktion',
    title: 'No intense training when badly sleep-deprived',
    text: 'When you’re badly short on sleep, don’t force intense interval training or push yourself to the limit.',
    priority: 1,
    when: (c) => c.massiverSchlafmangel,
    blocks: ['BEW_JOGGEN'],
  },
  {
    id: 'BEW_SITZPAUSEN',
    type: 'massgabe',
    title: 'Get up regularly',
    text: 'Every 45–60 minutes, stand up and move for 2–5 minutes.',
    priority: 3,
  },

  // Food and drink
  {
    id: 'ESS_MITTAG_TIMING',
    type: 'massgabe',
    title: 'Time lunch from when you woke up',
    text: 'Have lunch about 3–5 hours after waking up instead of sticking rigidly to noon.',
    priority: 2,
    when: (c) => c.minSeitAufwachen >= 150 && c.minSeitAufwachen <= 300 && !c.nachMittagessen,
  },
  {
    id: 'ESS_PROTEIN_KH',
    type: 'massgabe',
    title: 'Protein + carbs',
    text: 'Combine protein and carbs, e.g. eggs with bread, chicken with rice or Greek yogurt with oats.',
    priority: 3,
    when: (c) => c.minSeitAufwachen >= 150 && c.minSeitAufwachen <= 300 && !c.nachMittagessen,
  },
  {
    id: 'ESS_NICHT_SCHWER',
    type: 'restriktion',
    title: 'No very heavy meals',
    text: 'Avoid very large, heavy meals if they make you sleepy.',
    priority: 2,
    when: (c) => c.minSeitAufwachen >= 150 && c.minSeitAufwachen <= 300 && !c.nachMittagessen,
  },
  {
    id: 'ESS_SNACK',
    type: 'massnahme',
    title: 'Snack when hungry',
    text: 'Have a snack when you’re hungry, e.g. a banana and yogurt.',
    priority: 2,
    when: (c) => c.hunger === true,
  },
  {
    id: 'ESS_TRINKMENGE',
    type: 'massgabe',
    title: 'Drink throughout the day',
    text: 'Spread your drinking across the day – roughly 1.5–2 liters is a good guide for normal activity.',
    priority: 3,
  },

  // For focused work
  {
    id: 'FOK_ANSPRUCHSVOLL_FRUEH',
    type: 'massgabe',
    title: 'Hard things first',
    text: 'Tackle demanding tasks in the first 2–4 hours after waking up, if that’s when you feel most alert.',
    priority: 2,
    when: (c) => c.minSeitAufwachen <= 240 && !c.energietief,
  },
  {
    id: 'FOK_INTERVALLE',
    type: 'massnahme',
    title: 'Focus intervals',
    text: 'Work with focus for 25–50 minutes, then take a 5–10 minute break.',
    priority: 3,
  },
  {
    id: 'FOK_LICHT',
    type: 'massnahme',
    title: 'Bright light at your desk',
    text: 'Make sure your workspace is brightly lit.',
    priority: 3,
  },
  {
    id: 'FOK_HANDY_WEG',
    type: 'massnahme',
    title: 'Phone out of reach',
    text: 'Put your phone out of reach while you focus.',
    priority: 3,
  },
  {
    id: 'FOK_ROUTINE_INS_TIEF',
    type: 'massgabe',
    title: 'Routine tasks for your energy dip',
    text: 'Move routine tasks into your low-energy periods.',
    priority: 2,
    when: (c) => c.energietief,
  },
];

const POOR_SLEEP_HOURS = 7;
const SEVERE_SLEEP_LOSS_HOURS = 5;
const LATE_WAKE = 600; // 10:00
const PERFORM_SOON_MIN = 120;

/**
 * dayStart stands in for the wake time and dayEnd for the planned bedtime,
 * because the check-in does not capture either yet.
 */
export function measureContext(
  plan: Plan,
  state: { energy: Energy; sleepHours: number },
  signals: Signals = {},
): MeasureContext {
  const upcoming = plan.items
    .filter((item) => item.start !== null && item.start >= plan.now)
    .toSorted((a, b) => a.start! - b.start!);
  const nextFixed = upcoming.find((item) => item.fixed);
  const lunchEnd = plan.items
    .filter((item) => item.start !== null && /lunch/i.test(item.title))
    .map((item) => item.start! + item.duration)
    .find((end) => end <= plan.now && plan.now < end + 60);
  const low = state.energy === 'low';
  const severe = state.sleepHours < SEVERE_SLEEP_LOSS_HOURS;
  return {
    ...signals,
    minSeitAufwachen: plan.now - plan.dayStart,
    stdBisSchlafenszeit: (plan.dayEnd - plan.now) / 60,
    spaetAufgewacht: plan.dayStart >= LATE_WAKE,
    energietief: low,
    extremErschoepft: low && severe,
    massiverSchlafmangel: severe,
    fitFuerSport: state.energy === 'high',
    nachMittagessen: lunchEnd !== undefined,
    mussDanachLeistungsfaehig:
      nextFixed !== undefined && nextFixed.start! - plan.now <= PERFORM_SOON_MIN,
    // The first free block starts once the user is available again.
    freieZeitMin: Math.max(0, (upcoming[0]?.start ?? plan.dayEnd) - plan.availableFrom),
  };
}

const toMeasure = (block: Block): Measure => ({
  id: block.id,
  type: block.type,
  title: block.title,
  text: block.text,
  hint: block.hint ?? null,
});

/** Picks the energy measures deterministically; Gemma only reports signals from the message. */
export function selectMeasures(
  request: ReplanRequest,
  state: { energy: Energy; sleepHours: number },
  signals: Signals = {},
): EnergyMeasures {
  if (state.sleepHours >= POOR_SLEEP_HOURS && state.energy !== 'low')
    return { actions: [], restrictions: [] };
  const context = measureContext(request.plan, state, signals);
  const exclusions: string[] = request.checkIn.exclusions;
  const active = measureBlocks.filter(
    (block) =>
      !(block.exclusion && exclusions.includes(block.exclusion)) && (block.when?.(context) ?? true),
  );
  const blocked = new Set(active.flatMap((block) => block.blocks ?? []));
  const ranked = active
    .filter((block) => !blocked.has(block.id))
    .toSorted(
      (a, b) =>
        a.priority - b.priority ||
        Number(Boolean(b.core)) - Number(Boolean(a.core)) ||
        Number(Boolean(b.when)) - Number(Boolean(a.when)),
    );
  return {
    actions: ranked
      .filter((block) => block.type !== 'restriktion')
      .slice(0, 3)
      .map(toMeasure),
    restrictions: ranked
      .filter((block) => block.type === 'restriktion')
      .slice(0, 2)
      .map(toMeasure),
  };
}
