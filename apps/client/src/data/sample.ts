// Sample content for the Mneme UI — mirrors the design handoff's data.jsx.
// This is placeholder content for UX validation only (§10 step 2); the real
// source of truth is the local wa-sqlite DB wired in a later step.

export interface Label {
  name: string;
  color: string;
}

export interface Journal {
  id: string;
  name: string;
  subtitle: string;
  count: number;
  color: string;
  cover: CoverPattern;
  last: string;
}

export type CoverPattern = 'lines' | 'dots' | 'grid' | 'plain' | 'photo';

export interface Entry {
  id: string;
  journal: string;
  day: number;
  time: string;
  title: string;
  place: string;
  weather: string;
  mood: string;
  labels: string[];
  preview: string;
  words: number;
  media: number;
}

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'photo'; caption: string }
  | { type: 'check'; done: boolean; text: string }
  | { type: 'audio'; label: string; dur: string };

export interface OpenEntry {
  id: string;
  journal: string;
  title: string;
  dateLabel: string;
  time: string;
  place: string;
  weather: string;
  labels: string[];
  words: number;
  blocks: Block[];
}

export const MNEMONIC: string[] = [
  'velvet', 'harbor', 'spiral', 'candle',
  'meadow', 'quartz', 'ribbon', 'ember',
  'willow', 'cobalt', 'thistle', 'lantern',
];

// Label palette — muted tones, similar L/C, varied hue.
export const LABELS: Record<string, Label> = {
  reflection: { name: 'reflection', color: '#B0563A' }, // clay
  morning:    { name: 'morning',    color: '#B08A2E' }, // ochre
  travel:     { name: 'travel',     color: '#4E8B85' }, // dusty teal
  health:     { name: 'health',     color: '#6E8B5E' }, // sage
  idea:       { name: 'idea',       color: '#5A7BA6' }, // dusty blue
  family:     { name: 'family',     color: '#8E6A93' }, // mauve
  dream:      { name: 'dream',      color: '#6A6AA0' }, // indigo
};

// `count` here is a placeholder: the live value is derived from real entries in
// state/data.tsx (journalsWithCounts) and overrides whatever is set here.
export const JOURNALS: Journal[] = [
  { id: 'j-personal',  name: 'Personal',    subtitle: 'Daily reflections',   count: 0, color: '#B0563A', cover: 'lines', last: 'Today' },
  { id: 'j-travel',    name: 'Travel',      subtitle: 'Roads & rooms',       count: 0, color: '#4E8B85', cover: 'photo', last: '2 days ago' },
  { id: 'j-dreams',    name: 'Dreams',      subtitle: 'Nightnotes',          count: 0, color: '#6A6AA0', cover: 'dots',  last: 'Yesterday' },
  { id: 'j-gratitude', name: 'Gratitude',   subtitle: 'Three small things',  count: 0, color: '#B08A2E', cover: 'plain', last: '4 days ago' },
  { id: 'j-work',      name: 'Field Notes', subtitle: 'Work & craft',        count: 0, color: '#5A7BA6', cover: 'grid',  last: 'Today' },
];

// A believable June 2026 month for the calendar + lists.
export const ENTRIES: Entry[] = [
  {
    id: 'e1', journal: 'j-travel', day: 9, time: '9:41',
    title: 'The long way home',
    place: 'Lisbon · Alfama', weather: '☀ 24°', mood: 'unhurried',
    labels: ['travel', 'reflection'],
    preview: 'Took the 28 tram in the wrong direction on purpose. The whole city tips downhill toward the river…',
    words: 312, media: 1,
  },
  {
    id: 'e2', journal: 'j-personal', day: 9, time: '7:02',
    title: 'Before the noise',
    place: 'Home', weather: '☁ 18°', mood: 'quiet',
    labels: ['morning'],
    preview: 'Coffee, then the page. Trying to make this the first thing I touch, not the last.',
    words: 96, media: 0,
  },
  {
    id: 'e3', journal: 'j-dreams', day: 8, time: '3:18',
    title: 'A house with one more room',
    place: '', weather: '', mood: '',
    labels: ['dream'],
    preview: 'There was a door behind the bookshelf I had never noticed. Inside, all my old desks…',
    words: 140, media: 0,
  },
  {
    id: 'e4', journal: 'j-gratitude', day: 7, time: '21:30',
    title: 'Three small things',
    place: 'Home', weather: '', mood: 'warm',
    labels: ['family'],
    preview: '1 — the smell of rain through the screen door. 2 — M. laughing at her own joke. 3 — leftovers.',
    words: 58, media: 0,
  },
  {
    id: 'e5', journal: 'j-personal', day: 5, time: '18:12',
    title: 'On finishing things',
    place: '', weather: '', mood: 'restless',
    labels: ['reflection', 'idea'],
    preview: 'The last 10% is a different skill than the first 90%. I keep starting to avoid ending.',
    words: 204, media: 0,
  },
  {
    id: 'e6', journal: 'j-work', day: 4, time: '11:05',
    title: 'Field notes — the relay',
    place: 'Studio', weather: '', mood: 'focused',
    labels: ['idea'],
    preview: 'The server should never be the interesting part. Keep it dumb. Let the edges hold the meaning.',
    words: 176, media: 1,
  },
  {
    id: 'e7', journal: 'j-travel', day: 2, time: '14:40',
    title: 'Trains, mostly',
    place: 'Porto → Lisbon', weather: '⛅ 21°', mood: 'drifting',
    labels: ['travel'],
    preview: 'Three hours of vineyards and tunnels. Wrote half of this with my eyes closed.',
    words: 88, media: 1,
  },
  {
    id: 'e8', journal: 'j-personal', day: 1, time: '8:00',
    title: 'A clean first page',
    place: 'Home', weather: '☀ 19°', mood: 'hopeful',
    labels: ['morning', 'reflection'],
    preview: 'New month. No resolutions, just attention. Show up, write the true thing, close the book.',
    words: 132, media: 0,
  },
];

// Days in June 2026 that have at least one entry (for calendar dots).
export const ENTRY_DAYS: Record<number, Entry[]> = (() => {
  const m: Record<number, Entry[]> = {};
  ENTRIES.forEach((e) => {
    (m[e.day] = m[e.day] || []).push(e);
  });
  return m;
})();

// The fully-written entry shown in the editor (rich blocks).
export const OPEN_ENTRY: OpenEntry = {
  id: 'e1', journal: 'j-travel',
  title: 'The long way home',
  dateLabel: 'Tuesday, 9 June 2026',
  time: '9:41',
  place: 'Lisbon · Alfama',
  weather: '☀ 24°',
  labels: ['travel', 'reflection'],
  words: 312,
  blocks: [
    { type: 'p', text: 'Took the 28 tram in the wrong direction on purpose. The whole city tips downhill toward the river, and the trick is to let it. I got off where the rails curve and the laundry hangs across the street like sentences someone forgot to finish.' },
    { type: 'p', text: 'An old man was selling cherries from a crate. He weighed them in his hand instead of a scale, decided on a price, and was almost certainly wrong in my favor.' },
    { type: 'quote', text: 'You do not see a place until you are a little lost in it.' },
    { type: 'photo', caption: 'Alfama, looking down toward the Tejo' },
    { type: 'h', text: 'Things I want to remember' },
    { type: 'check', done: true,  text: 'The blue tiles on the church near the miradouro' },
    { type: 'check', done: true,  text: 'Calling home from the steps, no reason' },
    { type: 'check', done: false, text: 'The name of the cherry man — ask tomorrow' },
    { type: 'audio', label: 'Voice note — the tram bell', dur: '0:48' },
    { type: 'p', text: 'Walked back the long way, which is the whole point. Home is easy to find. The long way is the part you keep.' },
  ],
};

export function findJournal(id: string): Journal | undefined {
  return JOURNALS.find((j) => j.id === id);
}
