import type { CheckIn, Plan } from './contracts.js';

export const demoCheckIn: CheckIn = {
  sleepHours: 6.5,
  energy: 'medium',
  productiveTime: 'morning',
  exclusions: ['coffee', 'running'],
  sleepQuality: 'okay',
  mood: 3,
  stress: 2,
  focusTaskId: null,
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
      title: 'Lunch & a quick reset',
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
      title: 'Study for the statistics exam',
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
      title: 'Team meeting',
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
      title: 'A break in the fresh air',
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
      title: 'Work on my side project',
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
      title: 'Strength training at the gym',
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
      title: 'Dinner with friends',
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
      title: 'Emails & small to-dos',
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
    label: 'Marketing exam tomorrow',
    message:
      "I have a marketing exam tomorrow and still need to study. Can you fit that in and swap out things that don't matter?",
  },
  {
    label: 'My train is delayed',
    message:
      "My train is an hour late. I'm only available from 14:00. I only slept five hours and have little energy. Please replan the rest of my day realistically.",
  },
  {
    label: 'Do less today',
    message:
      "I'm exhausted today. Only plan the most important tasks and enough recovery. Fixed appointments and the statistics deadline stay. Everything else can stay open.",
  },
  {
    label: 'A packed afternoon',
    message:
      "I can only start on my tasks and appointments at 18:00 today. I can't move the fixed appointments. Is that doable?",
  },
];
