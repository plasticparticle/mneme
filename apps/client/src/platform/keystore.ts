// Keystore dispatcher — the stable public API for at-rest seal storage (§6).
// Callers (state/data.tsx) import these six functions and never learn which
// backend serves them: the browser bundle uses IndexedDB (keystore.web.ts), the
// Tauri shell uses OS secure storage (keystore.tauri.ts, Track B). The `KeyStore`
// type below is what forces both backends to keep identical signatures.
import { isTauri } from './shell';
import type { SealedSeed } from '../crypto/seedlock';
import type { SealedAiSettings } from '../ai/settings';
import * as web from './keystore.web';
import * as tauri from './keystore.tauri';

export interface KeyStore {
  loadSealedSeed(): Promise<SealedSeed | null>;
  storeSealedSeed(record: SealedSeed): Promise<void>;
  clearSealedSeed(): Promise<void>;
  loadAiSettingsRecord(): Promise<SealedAiSettings | null>;
  storeAiSettingsRecord(record: SealedAiSettings): Promise<void>;
  clearAiSettingsRecord(): Promise<void>;
}

// Assigning each module to KeyStore makes a signature drift a compile error.
const backend: KeyStore = isTauri() ? (tauri satisfies KeyStore) : (web satisfies KeyStore);

export const loadSealedSeed = (): Promise<SealedSeed | null> => backend.loadSealedSeed();
export const storeSealedSeed = (record: SealedSeed): Promise<void> => backend.storeSealedSeed(record);
export const clearSealedSeed = (): Promise<void> => backend.clearSealedSeed();
export const loadAiSettingsRecord = (): Promise<SealedAiSettings | null> => backend.loadAiSettingsRecord();
export const storeAiSettingsRecord = (record: SealedAiSettings): Promise<void> => backend.storeAiSettingsRecord(record);
export const clearAiSettingsRecord = (): Promise<void> => backend.clearAiSettingsRecord();
