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

// Source: Maßnahmen-Pool „Mehr Energie nach schlechtem Schlaf“.
export const measureBlocks: Block[] = [
  // Direkt nach dem Aufwachen
  {
    id: 'AUF_WASSER',
    type: 'massnahme',
    title: 'Wasser trinken',
    text: 'Trinke direkt nach dem Aufwachen 500 ml Wasser.',
    priority: 1,
    when: (c) => c.minSeitAufwachen <= 30,
  },
  {
    id: 'AUF_TAGESLICHT',
    type: 'massnahme',
    title: 'Tageslicht tanken',
    text: 'Geh innerhalb der ersten 30 Minuten für 10–20 Minuten nach draußen ins Tageslicht.',
    priority: 1,
    when: (c) => c.minSeitAufwachen <= 30,
  },
  {
    id: 'AUF_SPAZIEREN',
    type: 'massnahme',
    title: 'Zügig spazieren statt hinlegen',
    text: 'Geh 5–10 Minuten zügig spazieren, statt dich direkt wieder hinzulegen.',
    priority: 2,
    when: (c) => c.minSeitAufwachen <= 60,
  },
  {
    id: 'AUF_FRUEHSTUECK_OPTIONAL',
    type: 'massgabe',
    title: 'Frühstück nicht erzwingen',
    text: 'Wenn du keinen Hunger hast, musst du nicht frühstücken.',
    priority: 3,
    when: (c) => c.hunger === false && c.minSeitAufwachen <= 90,
  },

  // Wenn du schon spät aufgewacht bist
  {
    id: 'SPAET_KEIN_NACHHOLEN',
    type: 'restriktion',
    title: 'Morgen nicht nachholen',
    text: 'Versuch nicht, die komplette Morgenroutine nachzuholen. Starte direkt mit Licht, Wasser und den wichtigsten Aufgaben.',
    priority: 1,
    when: (c) => c.spaetAufgewacht,
  },
  {
    id: 'SPAET_ERSTE_15_MIN',
    type: 'massnahme',
    title: 'Kurzstart in 15 Minuten',
    text: 'In den ersten 15 Minuten: Wasser trinken, ins Licht gehen, kurz bewegen.',
    priority: 1,
    when: (c) => c.spaetAufgewacht && c.minSeitAufwachen <= 15,
    blocks: ['AUF_WASSER', 'AUF_TAGESLICHT', 'AUF_SPAZIEREN'],
  },
  {
    id: 'SPAET_WICHTIGE_AUFGABE',
    type: 'massnahme',
    title: 'Direkt eine wichtige Aufgabe',
    text: 'Starte direkt mit einer wichtigen Aufgabe und bearbeite sie 25–50 Minuten am Stück.',
    priority: 1,
    when: (c) => c.spaetAufgewacht && c.minSeitAufwachen > 15 && c.minSeitAufwachen <= 120,
  },
  {
    id: 'SPAET_PRIORISIEREN',
    type: 'massgabe',
    title: 'Wichtiges zuerst, Unwichtiges streichen',
    text: 'Erledige die wichtigsten Aufgaben zuerst und streiche unwichtige Aufgaben für heute.',
    priority: 2,
    when: (c) => c.spaetAufgewacht,
  },

  // Koffein
  {
    id: 'KOF_ERSTE_DOSIS',
    type: 'massnahme',
    title: 'Erste Koffeindosis',
    text: 'Nimm eine erste Dosis von 50–100 mg Koffein, sobald du wach bist und sie brauchst. Wenn du regelmäßig Kaffee trinkst, sind ca. 80–100 mg sinnvoll.',
    priority: 2,
    exclusion: 'coffee',
    when: (c) => c.koffeinHeuteMg === 0 && c.stdBisSchlafenszeit >= CAFFEINE_CUTOFF_H,
  },
  {
    id: 'KOF_NACHDOSIS',
    type: 'massnahme',
    title: 'Nachdosis bei erneutem Tief',
    text: 'Bei einem erneuten Tief kannst du nach etwa 2–3 Stunden weitere 50–100 mg Koffein nehmen.',
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
    title: 'Tagesmaximum Koffein',
    text: 'Halte die Tagesgesamtmenge bei maximal 400 mg Koffein, bei Koffeinempfindlichkeit deutlich weniger.',
    hint: 'Die Grenze gilt für gesunde Erwachsene.',
    priority: 1,
    exclusion: 'coffee',
    when: (c) => c.koffeinHeuteMg !== undefined && !caffeineLeft(c),
    blocks: ['KOF_ERSTE_DOSIS', 'KOF_NACHDOSIS', 'NAP_KOFFEIN'],
  },
  {
    id: 'KOF_CUTOFF',
    type: 'restriktion',
    title: 'Koffein-Cutoff vor dem Schlaf',
    text: 'Kein Koffein mehr, wenn es weniger als 8 Stunden bis zur geplanten Schlafenszeit sind.',
    priority: 1,
    core: true,
    exclusion: 'coffee',
    when: (c) => c.stdBisSchlafenszeit < CAFFEINE_CUTOFF_H,
  },
  {
    id: 'KOF_SPAET_VERZICHT',
    type: 'restriktion',
    title: 'Spät aufgewacht: auf Koffein verzichten',
    text: 'Wenn du erst am späten Nachmittag aufgewacht bist, verzichte lieber auf Koffein, falls es deinen Nachtschlaf gefährden würde.',
    priority: 2,
    exclusion: 'coffee',
    when: (c) => c.spaetAufgewacht && c.stdBisSchlafenszeit < CAFFEINE_CUTOFF_H,
  },
  {
    id: 'KOF_NICHT_UEBERDECKEN',
    type: 'restriktion',
    title: 'Sekundenschlaf nicht mit Koffein überdecken',
    text: 'Bei starkem Sekundenschlaf nicht versuchen, das mit Koffein zu überdecken. Schlaf hat Vorrang.',
    priority: 1,
    when: (c) => c.sekundenschlaf === true,
    blocks: ['KOF_ERSTE_DOSIS', 'KOF_NACHDOSIS', 'NAP_KOFFEIN'],
  },
  {
    id: 'KOF_ERST_BEWEGUNG',
    type: 'massgabe',
    title: 'Erst bewegen, dann Kaffee',
    text: 'Wenn du nach dem Mittagessen müde bist: zuerst 10 Minuten spazieren, bevor du Kaffee nachlegst.',
    priority: 2,
    exclusion: 'coffee',
    when: (c) => c.nachMittagessen && sleepy(c) && c.stdBisSchlafenszeit >= CAFFEINE_CUTOFF_H,
  },

  // Tactical Nap
  {
    id: 'NAP_KURZ',
    type: 'massnahme',
    title: 'Tactical Nap',
    text: 'Mach einen Nap mit 10–20 Minuten tatsächlichem Schlaf. Stell den Wecker auf 20–25 Minuten, damit du Zeit zum Einschlafen hast.',
    priority: 1,
    core: true,
    when: (c) => sleepy(c) && napAllowed(c) && c.freieZeitMin >= 25,
  },
  {
    id: 'NAP_ZEITFENSTER',
    type: 'massgabe',
    title: 'Bestes Nap-Zeitfenster',
    text: 'Die beste Zeit für einen Nap ist ungefähr zwischen 13:00 und 15:00 Uhr.',
    priority: 3,
    when: (c) => sleepy(c) && napAllowed(c),
  },
  {
    id: 'NAP_NUR_WENN_SCHLAEFRIG',
    type: 'massgabe',
    title: 'Nap nur bei echter Schläfrigkeit',
    text: 'Plane einen Nap nur ein, wenn du wirklich schläfrig bist und er deinen Nachtschlaf nicht verschiebt.',
    priority: 3,
    when: (c) => c.schlaefrig === undefined && c.energietief && napAllowed(c),
  },
  {
    id: 'NAP_ABSTAND_SCHLAF',
    type: 'restriktion',
    title: 'Kein Nap kurz vor der Schlafenszeit',
    text: 'Vermeide einen Nap in den letzten 6–8 Stunden vor deiner geplanten Schlafenszeit, wenn er deinen Nachtschlaf beeinträchtigt.',
    priority: 1,
    when: (c) => sleepy(c) && !napAllowed(c),
    blocks: ['NAP_KURZ', 'NAP_KOFFEIN', 'NAP_LANG'],
  },
  {
    id: 'NAP_DANACH_AKTIVIEREN',
    type: 'massnahme',
    title: 'Nach dem Nap aktivieren',
    text: 'Geh nach dem Nap 5–10 Minuten ins Tageslicht oder beweg dich.',
    priority: 1,
    when: (c) => c.nachNap === true,
  },
  {
    id: 'NAP_KOFFEIN',
    type: 'massnahme',
    title: 'Coffee Nap (optional)',
    text: 'Optional: Trink direkt vor dem Nap einen Kaffee. Die Wirkung setzt ungefähr beim Aufwachen ein.',
    hint: 'Zählt zum Koffein-Tagesmaximum.',
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
    title: 'Keine 45–60-Minuten-Naps',
    text: 'Keine Naps von 45–60 Minuten, wenn du danach schnell wieder leistungsfähig sein musst – das Risiko für Schlafträgheit ist höher.',
    priority: 2,
    when: (c) => sleepy(c) && c.mussDanachLeistungsfaehig,
  },
  {
    id: 'NAP_LANG',
    type: 'massnahme',
    title: 'Langer Nap als Alternative',
    text: 'Wenn du extrem erschöpft bist und viel Zeit hast, kann ein Nap von etwa 90 Minuten eine Alternative sein.',
    hint: 'Das ist kein garantiert vollständiger Schlafzyklus.',
    priority: 3,
    when: (c) =>
      c.extremErschoepft && c.freieZeitMin >= 100 && !c.mussDanachLeistungsfaehig && napAllowed(c),
  },

  // Bewegung als Wachmacher
  {
    id: 'BEW_ENERGIETIEF',
    type: 'massnahme',
    title: 'Zügig gehen bei Energietief',
    text: 'Geh bei einem akuten Energietief 5–10 Minuten zügig.',
    priority: 1,
    core: true,
    when: (c) => c.energietief,
  },
  {
    id: 'BEW_NACH_MITTAG',
    type: 'massnahme',
    title: 'Spaziergang nach dem Mittagessen',
    text: 'Mach nach dem Mittagessen einen Spaziergang von 10–20 Minuten.',
    priority: 2,
    when: (c) => c.nachMittagessen,
  },
  {
    id: 'BEW_TREPPE_RAD',
    type: 'massnahme',
    title: 'Treppensteigen oder lockeres Radfahren',
    text: 'Wenn du dich schläfrig fühlst: 10 Minuten Treppensteigen oder lockeres Radfahren.',
    priority: 2,
    when: (c) => sleepy(c),
  },
  {
    id: 'BEW_JOGGEN',
    type: 'massnahme',
    title: 'Lockeres Joggen',
    text: 'Wenn du dich fit genug fühlst: 20–30 Minuten lockeres Joggen.',
    priority: 3,
    exclusion: 'running',
    when: (c) => c.fitFuerSport && !c.massiverSchlafmangel,
  },
  {
    id: 'BEW_KEIN_HIIT',
    type: 'restriktion',
    title: 'Kein intensives Training bei massivem Schlafmangel',
    text: 'Bei massivem Schlafmangel kein intensives Intervalltraining und kein Training bis ans Limit erzwingen.',
    priority: 1,
    when: (c) => c.massiverSchlafmangel,
    blocks: ['BEW_JOGGEN'],
  },
  {
    id: 'BEW_SITZPAUSEN',
    type: 'massgabe',
    title: 'Regelmäßig aufstehen',
    text: 'Steh alle 45–60 Minuten für 2–5 Minuten auf und beweg dich.',
    priority: 3,
  },

  // Essen und Trinken
  {
    id: 'ESS_MITTAG_TIMING',
    type: 'massgabe',
    title: 'Mittagessen relativ zum Aufwachen',
    text: 'Iss zu Mittag ungefähr 3–5 Stunden nach dem Aufwachen, statt starr um 12 Uhr.',
    priority: 2,
    when: (c) => c.minSeitAufwachen >= 150 && c.minSeitAufwachen <= 300 && !c.nachMittagessen,
  },
  {
    id: 'ESS_PROTEIN_KH',
    type: 'massgabe',
    title: 'Protein + Kohlenhydrate',
    text: 'Kombiniere Protein und Kohlenhydrate, z. B. Eier mit Brot, Hähnchen mit Reis oder Quark mit Haferflocken.',
    priority: 3,
    when: (c) => c.minSeitAufwachen >= 150 && c.minSeitAufwachen <= 300 && !c.nachMittagessen,
  },
  {
    id: 'ESS_NICHT_SCHWER',
    type: 'restriktion',
    title: 'Keine sehr schweren Mahlzeiten',
    text: 'Vermeide sehr große, schwere Mahlzeiten, wenn sie dich schläfrig machen.',
    priority: 2,
    when: (c) => c.minSeitAufwachen >= 150 && c.minSeitAufwachen <= 300 && !c.nachMittagessen,
  },
  {
    id: 'ESS_SNACK',
    type: 'massnahme',
    title: 'Snack bei Hunger',
    text: 'Iss bei Hunger einen Snack, z. B. Banane und Quark.',
    priority: 2,
    when: (c) => c.hunger === true,
  },
  {
    id: 'ESS_TRINKMENGE',
    type: 'massgabe',
    title: 'Über den Tag verteilt trinken',
    text: 'Trink über den Tag verteilt – bei normaler Aktivität grob 1,5–2 Liter als Orientierung.',
    priority: 3,
  },

  // Für konzentriertes Arbeiten
  {
    id: 'FOK_ANSPRUCHSVOLL_FRUEH',
    type: 'massgabe',
    title: 'Schweres zuerst',
    text: 'Erledige anspruchsvolle Aufgaben in den ersten 2–4 Stunden nach dem Aufwachen, sofern du dich dann am wachsten fühlst.',
    priority: 2,
    when: (c) => c.minSeitAufwachen <= 240 && !c.energietief,
  },
  {
    id: 'FOK_INTERVALLE',
    type: 'massnahme',
    title: 'Fokus-Intervalle',
    text: 'Arbeite 25–50 Minuten konzentriert und mach danach 5–10 Minuten Pause.',
    priority: 3,
  },
  {
    id: 'FOK_LICHT',
    type: 'massnahme',
    title: 'Helles Licht am Arbeitsplatz',
    text: 'Sorg für helles Licht an deinem Arbeitsplatz.',
    priority: 3,
  },
  {
    id: 'FOK_HANDY_WEG',
    type: 'massnahme',
    title: 'Handy außer Reichweite',
    text: 'Leg dein Handy außer Reichweite, während du konzentriert arbeitest.',
    priority: 3,
  },
  {
    id: 'FOK_ROUTINE_INS_TIEF',
    type: 'massgabe',
    title: 'Routine ins Energietief',
    text: 'Verschiebe Routineaufgaben in dein Energietief.',
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
    .filter((item) => item.start !== null && /mittag/i.test(item.title))
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
