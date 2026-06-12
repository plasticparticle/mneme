// At-rest sealing for the AI settings (the API key, mainly). Wrapped under
// identity.aiKey — HKDF output of the vault seed — so the record is only
// openable while the vault is unlocked, and a different vault's record fails
// the AEAD tag (fails closed). No Argon2id here: the wrapping key already has
// full entropy, there is nothing to stretch.
import { encrypt, decrypt } from '../crypto/aead';
import { utf8, fromUtf8 } from '../crypto/bytes';
import type { AiSettings } from './types';

const AAD = utf8('mneme:ai-settings:v1');

export interface SealedAiSettings {
  v: 1;
  /** [version:1B][nonce:24B][ct+tag] over the JSON settings. */
  blob: Uint8Array;
}

export function sealAiSettings(aiKey: Uint8Array, settings: AiSettings): SealedAiSettings {
  return { v: 1, blob: encrypt(aiKey, utf8(JSON.stringify(settings)), AAD) };
}

/** Throws on tamper or a record sealed by a different vault. */
export function openAiSettings(aiKey: Uint8Array, record: SealedAiSettings): AiSettings {
  const parsed = JSON.parse(fromUtf8(decrypt(aiKey, record.blob, AAD))) as AiSettings;
  if (parsed.v !== 1) throw new Error(`unsupported ai-settings version ${parsed.v}`);
  return parsed;
}
