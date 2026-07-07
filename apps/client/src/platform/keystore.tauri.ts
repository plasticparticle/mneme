// The Tauri 2 native keystore backend — §6 at-rest storage in the OS keychain
// (Stronghold) with biometric-gated unlock. Implemented in Track B of the Tauri
// integration; it stores the same version-prefixed sealed records as the web
// backend, but in native secure storage instead of IndexedDB.
//
// These functions are NEVER reached in the PWA build: keystore.ts dispatches here
// only when isTauri() is true, which the browser bundle never sees. They exist so
// the seam type-checks today and Track B has one file to fill in. Intentionally no
// `@tauri-apps/*` imports yet — those land with the shell.
import type { SealedSeed } from '../crypto/seedlock';
import type { SealedAiSettings } from '../ai/settings';

function notImplemented(): never {
  throw new Error('Tauri keystore backend not yet implemented (Tauri integration Track B)');
}

export function loadSealedSeed(): Promise<SealedSeed | null> {
  return notImplemented();
}

export function storeSealedSeed(_record: SealedSeed): Promise<void> {
  return notImplemented();
}

export function clearSealedSeed(): Promise<void> {
  return notImplemented();
}

export function loadAiSettingsRecord(): Promise<SealedAiSettings | null> {
  return notImplemented();
}

export function storeAiSettingsRecord(_record: SealedAiSettings): Promise<void> {
  return notImplemented();
}

export function clearAiSettingsRecord(): Promise<void> {
  return notImplemented();
}
