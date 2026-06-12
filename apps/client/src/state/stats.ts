// Pure stat helpers over decrypted in-memory entries. All day math is UTC to
// match the calendar grid's day boundaries (see screens/Calendar.tsx).
import type { JournalEntry } from '../sync/engine';

const DAY_MS = 86_400_000;

/** UTC day index (days since epoch) — the same day boundaries the calendar grid uses. */
export function utcDayIndex(ts: number): number {
  return Math.floor(ts / DAY_MS);
}

/**
 * Consecutive UTC days with at least one entry, ending today — or yesterday as
 * grace, so an unbroken run doesn't read 0 before today's entry is written.
 */
export function dayStreak(entries: JournalEntry[], now: number): number {
  const days = new Set<number>();
  for (const e of entries) days.add(utcDayIndex(e.createdAt));
  let d = utcDayIndex(now);
  if (!days.has(d)) d -= 1;
  let streak = 0;
  while (days.has(d)) {
    streak += 1;
    d -= 1;
  }
  return streak;
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Whitespace-word total across all entries. */
export function totalWords(entries: JournalEntry[]): number {
  let words = 0;
  for (const e of entries) words += wordCount(e.bodyText);
  return words;
}

/** Number of distinct UTC days with at least one entry. */
export function journaledDays(entries: JournalEntry[]): number {
  const days = new Set<number>();
  for (const e of entries) days.add(utcDayIndex(e.createdAt));
  return days.size;
}

/** The longest run of consecutive UTC days with entries, anywhere in history. */
export function longestStreak(entries: JournalEntry[]): number {
  const days = [...new Set(entries.map((e) => utcDayIndex(e.createdAt)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = Number.NaN;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** Whitespace-word total across entries in the given UTC (year, month 0-11). */
export function monthWords(entries: JournalEntry[], year: number, month: number): number {
  let words = 0;
  for (const e of entries) {
    const d = new Date(e.createdAt);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) words += wordCount(e.bodyText);
  }
  return words;
}

/** Compact stat label: 999 → "999", 1438 → "1.4k", 2000 → "2k". */
export function compactCount(n: number): string {
  return n < 1000 ? String(n) : (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

/** Entries sharing the UTC day+month from years before `year`, newest first. */
export function onThisDay(entries: JournalEntry[], month: number, day: number, year: number): JournalEntry[] {
  return entries
    .filter((e) => {
      const d = new Date(e.createdAt);
      return d.getUTCMonth() === month && d.getUTCDate() === day && d.getUTCFullYear() < year;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Per-day entry counts for the trailing `weeks` Mon-first UTC weeks, oldest day
 * first, ending with the current week (days after today stay 0). One value per
 * day, `weeks * 7` total — feeds the heatmap's week-per-column layout.
 */
export function dailyCounts(entries: JournalEntry[], now: number, weeks: number): number[] {
  const todayIdx = utcDayIndex(now);
  const monFirstDow = (new Date(now).getUTCDay() + 6) % 7;
  const end = todayIdx - monFirstDow + 6; // Sunday closing the current week
  const start = end - weeks * 7 + 1;
  const counts = new Array<number>(weeks * 7).fill(0);
  for (const e of entries) {
    const i = utcDayIndex(e.createdAt) - start;
    if (i >= 0 && i < counts.length) counts[i] += 1;
  }
  return counts;
}
