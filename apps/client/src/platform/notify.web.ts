// Browser notification backend. Immediate notifications go through the standard
// Notification API (permission-gated). The browser has no durable local scheduler
// — firing while the tab is closed needs a service worker + web-push, which is a
// separate PWA build step and out of scope for the Tauri work — so schedule() is a
// deliberate no-op here. The Tauri backend is the one that schedules durably; on
// iOS that gap is exactly why the native shell exists.
import type { NotifyOptions, ScheduledNotify } from './notify';

export async function available(): Promise<boolean> {
  // 'denied' is neither granted nor grantable — requestPermission() is a no-op
  // there, so reporting true would offer notifications that can never fire.
  return typeof Notification !== 'undefined' && Notification.permission !== 'denied';
}

export async function notify({ title, body }: NotifyOptions): Promise<void> {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* user dismissed the prompt — stay silent */
    }
  }
  if (Notification.permission === 'granted') new Notification(title, { body });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function schedule(_opts: ScheduledNotify): Promise<void> {
  /* no durable browser scheduling without a service worker (out of scope) */
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function cancel(_id: string): Promise<void> {
  /* nothing was scheduled */
}
