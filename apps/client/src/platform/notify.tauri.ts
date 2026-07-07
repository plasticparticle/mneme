// The Tauri 2 native notification backend — built in Track B on
// `@tauri-apps/plugin-notification`, which posts and durably schedules local OS
// notifications (fire with the app backgrounded or closed) on desktop and mobile.
// This is the payoff that makes reminders reliable on iOS.
//
// Never reached in the PWA build (notify.ts dispatches here only when isTauri()).
// `available()` returns false so nothing tries to use the unbuilt backend if this
// module is ever loaded outside the shell. Intentionally no `@tauri-apps/*` imports
// yet — those land with the shell in Track B.
import type { NotifyOptions, ScheduledNotify } from './notify';

function notImplemented(): never {
  throw new Error('Tauri notification backend not yet implemented (Tauri integration Track B)');
}

export async function available(): Promise<boolean> {
  return false;
}

export function notify(_opts: NotifyOptions): Promise<void> {
  return notImplemented();
}

export function schedule(_opts: ScheduledNotify): Promise<void> {
  return notImplemented();
}

export function cancel(_id: string): Promise<void> {
  return notImplemented();
}
