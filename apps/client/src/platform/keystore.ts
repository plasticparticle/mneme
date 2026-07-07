// Keystore dispatcher — the stable public API for at-rest seal storage (§6).
// Callers (state/data.tsx) import these six functions and never learn which
// backend serves them: the browser bundle uses IndexedDB (keystore.web.ts), the
// Tauri shell uses OS secure storage (keystore.tauri.ts, Track B). The `KeyStore`
// type below is what forces both backends to keep identical signatures.
import { isTauri } from './shell';
import type { SealedSeed } from '../crypto/seedlock';
import type { SealedAiSettings } from '../ai/settings';

export interface KeyStore {
  loadSealedSeed(): Promise<SealedSeed | null>;
  storeSealedSeed(record: SealedSeed): Promise<void>;
  clearSealedSeed(): Promise<void>;
  loadAiSettingsRecord(): Promise<SealedAiSettings | null>;
  storeAiSettingsRecord(record: SealedAiSettings): Promise<void>;
  clearAiSettingsRecord(): Promise<void>;
}

// Lazy dynamic import so only the reachable backend ships per platform: once
// Track B fills keystore.tauri.ts with @tauri-apps/* code, a static import here
// would bundle (and evaluate) the native backend in every PWA build. Typing the
// promise as KeyStore still makes a signature drift in either backend a compile
// error; the resolved module is cached after the first call.
let backend: Promise<KeyStore> | null = null;
function load(): Promise<KeyStore> {
  backend ??= isTauri() ? import('./keystore.tauri') : import('./keystore.web');
  return backend;
}

export const loadSealedSeed = async (): Promise<SealedSeed | null> => (await load()).loadSealedSeed();
export const storeSealedSeed = async (record: SealedSeed): Promise<void> => (await load()).storeSealedSeed(record);
export const clearSealedSeed = async (): Promise<void> => (await load()).clearSealedSeed();
export const loadAiSettingsRecord = async (): Promise<SealedAiSettings | null> => (await load()).loadAiSettingsRecord();
export const storeAiSettingsRecord = async (record: SealedAiSettings): Promise<void> => (await load()).storeAiSettingsRecord(record);
export const clearAiSettingsRecord = async (): Promise<void> => (await load()).clearAiSettingsRecord();
