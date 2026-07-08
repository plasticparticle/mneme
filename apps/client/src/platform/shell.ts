// Runtime detection of the host shell. Today the only shells are the browser
// (PWA) and — once §10 step 8 lands — the Tauri 2 native shell (desktop + mobile).
// Everything shell-specific (at-rest key storage, native notifications) branches
// on this, so the single web codebase (§3/§4) runs unchanged in both. Detection is
// runtime, never a build-time fork: the same bundle is what Tauri loads.

/**
 * True when running inside the Tauri 2 native shell. Tauri 2 injects
 * `window.__TAURI_INTERNALS__` before the app code runs, on every platform.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * True on iPhone / iPad / iPod — where every browser is forced onto Apple's
 * WebKit, so the PWA inherits iOS's ~7-day storage eviction and unreliable web
 * push regardless of which browser is used (see docs/PWA.md, docs/ROADMAP.md).
 * Used to surface a one-time caveat notice that must NOT appear on Android or
 * desktop. iPadOS 13+ reports a desktop-Safari UA, so fall back to the
 * touch-capable "MacIntel" heuristic to still catch iPads.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (/iP(hone|od|ad)/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}
