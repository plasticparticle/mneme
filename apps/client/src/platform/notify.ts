// Notification dispatcher — the seam reminders (§10 step 6) deliver through. The
// browser posts via the Notification API and cannot durably schedule while closed
// (notify.web.ts); the Tauri shell schedules real local OS notifications that fire
// with the app backgrounded or shut — the whole reason iOS needs the shell
// (notify.tauri.ts, Track B).
//
// Content stays generic per §3 (the relay never sees it, and neither should the OS
// lock screen leak entry text) — the app decrypts and shows the real entry on tap.
import { isTauri } from './shell';

export interface NotifyOptions {
  title: string;
  body?: string;
}

export interface ScheduledNotify extends NotifyOptions {
  /** Stable id so the notification can be rescheduled or cancelled (a reminder id). */
  id: string;
  /** When to fire, epoch milliseconds. */
  at: number;
}

export interface Notifier {
  /** Whether the host can post notifications (permission granted or grantable). */
  available(): Promise<boolean>;
  /** Post a notification immediately. */
  notify(opts: NotifyOptions): Promise<void>;
  /** Queue a local notification to fire at `opts.at`. Durable only under Tauri. */
  schedule(opts: ScheduledNotify): Promise<void>;
  /** Cancel a scheduled notification by id (no-op if unknown). */
  cancel(id: string): Promise<void>;
}

// Lazy dynamic import, mirroring keystore.ts: once Track B adds the
// @tauri-apps/plugin-notification import to notify.tauri.ts, a static import
// here would bundle the native backend into every PWA build. Typing the promise
// as Notifier keeps signature drift in either backend a compile error.
let backend: Promise<Notifier> | null = null;
function load(): Promise<Notifier> {
  backend ??= isTauri() ? import('./notify.tauri') : import('./notify.web');
  return backend;
}

export const notifier: Notifier = {
  available: async () => (await load()).available(),
  notify: async (opts) => (await load()).notify(opts),
  schedule: async (opts) => (await load()).schedule(opts),
  cancel: async (id) => (await load()).cancel(id),
};
