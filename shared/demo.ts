import type { CheckIn, Plan } from './contracts.js';

export const demoCheckIn: CheckIn = {
  sleepHours: 6.5,
  energy: 'medium',
  productiveTime: 'morning',
  exclusions: ['coffee', 'running'],
};

// A deliberately fixed, synthetic day makes the demo repeatable at any real time.
export const demoPlan: Plan = {
  date: '2026-10-24',
  timeZone: 'Europe/Berlin',
  now: 780,
  availableFrom: 780,
  dayStart: 720,
  dayEnd: 1290,
  items: [
    {
      id: 'lunch',
      title: 'Mittagessen & kurz abschalten',
      category: 'recovery',
      start: 720,
      duration: 45,
      fixed: false,
      priority: 'medium',
      effort: 'low',
      deadline: null,
      tags: [],
    },
    {
      id: 'study',
      title: 'Für die Statistik-Klausur lernen',
      category: 'study',
      start: 810,
      duration: 90,
      fixed: false,
      priority: 'high',
      effort: 'high',
      deadline: 1080,
      tags: [],
    },
    {
      id: 'team',
      title: 'Team-Meeting',
      category: 'work',
      start: 930,
      duration: 60,
      fixed: true,
      priority: 'high',
      effort: 'medium',
      deadline: null,
      tags: [],
    },
    {
      id: 'break',
      title: 'Eine Pause an der frischen Luft',
      category: 'recovery',
      start: 990,
      duration: 15,
      fixed: false,
      priority: 'medium',
      effort: 'low',
      deadline: null,
      tags: [],
    },
    {
      id: 'project',
      title: 'Am eigenen Projekt weiterarbeiten',
      category: 'work',
      start: 1005,
      duration: 90,
      fixed: false,
      priority: 'medium',
      effort: 'high',
      deadline: null,
      tags: [],
    },
    {
      id: 'gym',
      title: 'Krafttraining im Gym',
      category: 'movement',
      start: 1110,
      duration: 45,
      fixed: false,
      priority: 'low',
      effort: 'high',
      deadline: null,
      tags: ['gym'],
    },
    {
      id: 'friends',
      title: 'Abendessen mit Freunden',
      category: 'social',
      start: 1170,
      duration: 60,
      fixed: true,
      priority: 'high',
      effort: 'low',
      deadline: null,
      tags: [],
    },
    {
      id: 'inbox',
      title: 'Mails & kleine To-dos',
      category: 'work',
      start: 1245,
      duration: 30,
      fixed: false,
      priority: 'low',
      effort: 'low',
      deadline: null,
      tags: [],
    },
  ],
};

export const demoPrompts = [
  {
    label: 'Morgen eine Marketing-Klausur',
    message:
      'Ich schreibe morgen noch eine Marketing-Klausur und muss noch lernen. Kannst du das einplanen und irrelevante Sachen austauschen?',
  },
  {
    label: 'Mein Zug hat Verspätung',
    message:
      'Mein Zug hat eine Stunde Verspätung. Ich bin erst um 14:00 verfügbar. Ich habe nur fünf Stunden geschlafen und wenig Energie. Bitte plane meinen restlichen Tag realistisch um.',
  },
  {
    label: 'Heute weniger schaffen',
    message:
      'Ich bin heute erschöpft. Plane nur die wichtigsten Aufgaben und genug Erholung. Feste Termine und die Statistik-Frist bleiben bestehen. Alles andere darf offen bleiben.',
  },
  {
    label: 'Ein voller Nachmittag',
    message:
      'Ich kann heute erst ab 18 Uhr mit meinen Aufgaben und Terminen beginnen. Die festen Termine kann ich nicht verschieben. Ist das machbar?',
  },
];
