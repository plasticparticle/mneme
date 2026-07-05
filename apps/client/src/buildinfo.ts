// Build provenance injected by vite.config.ts `define`. The typeof guards keep
// the module loadable under the tsx repro scripts, where Vite never ran.
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** ISO timestamp of the production build (dev-server start while developing). */
export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

/** BUILD_TIME in the device locale, e.g. "Jul 5, 2026, 14:32". */
export function buildTimeLabel(): string {
  if (!BUILD_TIME) return 'unknown';
  const d = new Date(BUILD_TIME);
  return Number.isNaN(d.getTime())
    ? 'unknown'
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
