// The browser (PWA) keystore backend. What the PWA persists outside the per-owner
// OPFS database: the optional Argon2id/PRF-sealed seed (§6 at-rest) and the
// seed-key-sealed AI settings. IndexedDB rather than localStorage because the
// records carry binary fields and IDB is async.
//
// Selected by keystore.ts when not running under Tauri. The Tauri backend
// (keystore.tauri.ts, Track B) stores the same records in OS secure storage.
import { isSealedSeed, type SealedSeed } from '../crypto/seedlock';
import type { SealedAiSettings } from '../ai/settings';

const DB_NAME = 'mneme-keystore';
const STORE = 'kv';
const KEY = 'sealed-seed';
const AI_KEY = 'ai-settings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb unavailable'));
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('keystore operation failed'));
    });
  } finally {
    db.close();
  }
}

/** null when nothing is stored or IndexedDB is unavailable (private mode, Node). */
export async function loadSealedSeed(): Promise<SealedSeed | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const rec = (await run('readonly', (s) => s.get(KEY))) as SealedSeed | undefined;
    return rec && isSealedSeed(rec) ? rec : null;
  } catch {
    return null;
  }
}

/** Throws when persistence fails — callers degrade to the nothing-stored mode. */
export async function storeSealedSeed(record: SealedSeed): Promise<void> {
  await run('readwrite', (s) => s.put(record, KEY));
}

export async function clearSealedSeed(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    /* nothing stored / no IDB — locked-out is the safe default */
  }
}

/** null when nothing is stored or IndexedDB is unavailable. */
export async function loadAiSettingsRecord(): Promise<SealedAiSettings | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const rec = (await run('readonly', (s) => s.get(AI_KEY))) as SealedAiSettings | undefined;
    return rec && rec.v === 1 ? rec : null;
  } catch {
    return null;
  }
}

/** Throws when persistence fails — callers degrade to the not-configured mode. */
export async function storeAiSettingsRecord(record: SealedAiSettings): Promise<void> {
  await run('readwrite', (s) => s.put(record, AI_KEY));
}

export async function clearAiSettingsRecord(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await run('readwrite', (s) => s.delete(AI_KEY));
  } catch {
    /* nothing stored / no IDB — not-configured is the safe default */
  }
}
