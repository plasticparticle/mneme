// At-rest sealing for the AI settings (the API key, mainly). Wrapped under
// identity.aiKey — HKDF output of the vault seed — so the record is only
// openable while the vault is unlocked, and a different vault's record fails
// the AEAD tag (fails closed). No Argon2id here: the wrapping key already has
// full entropy, there is nothing to stretch.
import { encrypt, decrypt } from '../crypto/aead';
import { utf8, fromUtf8 } from '../crypto/bytes';
import type { AiSettings } from './types';

const AAD = utf8('mneme:ai-settings:v1');

/**
 * Sync bookkeeping for the settings-as-synced-record path (kind: 'aiSettings'
 * through the entry oplog). Cleartext next to the sealed blob: none of it is
 * secret (the record id is already cleartext on the relay), and it must be
 * readable to rebuild the outbox — records from before sync lack it entirely.
 */
export interface AiSyncMeta {
  /** Cleartext oplog id (random). Absent until the first push mints one. */
  recordId?: string;
  /** LWW clock of the sealed settings. */
  updatedAt: number;
  /** True while the current version still waits in the sync outbox. */
  dirty: boolean;
}

export interface SealedAiSettings {
  v: 1;
  /** [version:1B][nonce:24B][ct+tag] over the JSON settings. */
  blob: Uint8Array;
  /** Absent on records sealed before AI-settings sync existed. */
  sync?: AiSyncMeta;
}

export function sealAiSettings(aiKey: Uint8Array, settings: AiSettings, sync?: AiSyncMeta): SealedAiSettings {
  return { v: 1, blob: encrypt(aiKey, utf8(JSON.stringify(settings)), AAD), sync };
}

/** Throws on tamper or a record sealed by a different vault. */
export function openAiSettings(aiKey: Uint8Array, record: SealedAiSettings): AiSettings {
  const parsed = JSON.parse(fromUtf8(decrypt(aiKey, record.blob, AAD))) as AiSettings;
  if (parsed.v !== 1) throw new Error(`unsupported ai-settings version ${parsed.v}`);
  return parsed;
}
