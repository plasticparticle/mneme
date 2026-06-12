// At-rest seed protection (§6 "PWA at-rest"): the BIP39 seed sealed under an
// Argon2id passphrase-derived key, for users who opt into staying signed in on
// a device. Opt-in only — the default remains "persist nothing, re-enter the
// phrase on every cold start". The sealed record's cost is being an offline-
// brute-forceable artifact on disk; the deliberately slow KDF is what makes
// each guess expensive.
import { argon2idAsync } from '@noble/hashes/argon2';
import { encrypt, decrypt } from './aead';
import { randomBytes, utf8 } from './bytes';

export interface KdfParams {
  /** time cost (passes) */
  t: number;
  /** memory cost in KiB */
  m: number;
  /** parallelism */
  p: number;
}

// §6 names libsodium MODERATE (256 MiB / ops 3), but that assumes native code;
// pure-JS argon2 at 256 MiB blows far past any unlock budget. 64 MiB / t=3
// lands around a second on desktop hardware. The params are stored inside the
// record, so raising them later only affects new seals — old records still open.
export const DEFAULT_KDF: KdfParams = { t: 3, m: 64 * 1024, p: 1 };

const SALT_LEN = 16;
const KEY_LEN = 32;

/** What the keystore persists. Structured-clone-safe (typed arrays + plain values). */
export interface SealedSeed {
  v: 1;
  salt: Uint8Array;
  kdf: KdfParams;
  /** aead.ts blob — [version:1B][nonce:24B][ct+tag] — over the 64-byte seed. */
  blob: Uint8Array;
}

/**
 * The wrapping key together with the salt/params it was derived under. Held in
 * memory while unlocked so phrase rotation can re-seal the new seed without
 * asking for the passphrase again.
 */
export interface WrapKey {
  key: Uint8Array;
  salt: Uint8Array;
  kdf: KdfParams;
}

// Pins the ciphertext to this purpose: a sealed seed can't be replayed where an
// entry blob is expected, nor the other way around.
const AAD = utf8('mneme:seedlock:v1');

async function deriveWrapKey(passphrase: string, salt: Uint8Array, kdf: KdfParams): Promise<WrapKey> {
  // argon2idAsync yields to the event loop between blocks, so a ~1s derivation
  // doesn't freeze the unlock screen.
  const key = await argon2idAsync(utf8(passphrase.normalize('NFKD')), salt, { ...kdf, dkLen: KEY_LEN });
  return { key, salt, kdf };
}

/** Seal the seed under a fresh random salt and the given passphrase. */
export async function sealSeed(seed: Uint8Array, passphrase: string): Promise<{ record: SealedSeed; wrap: WrapKey }> {
  const wrap = await deriveWrapKey(passphrase, randomBytes(SALT_LEN), DEFAULT_KDF);
  return { record: sealWithKey(wrap, seed), wrap };
}

/** Re-seal with an existing wrap key — phrase rotation: same passphrase, new seed. */
export function sealWithKey(wrap: WrapKey, seed: Uint8Array): SealedSeed {
  return { v: 1, salt: wrap.salt, kdf: wrap.kdf, blob: encrypt(wrap.key, seed, AAD) };
}

/** Throws on a wrong passphrase (AEAD tag mismatch) or an unknown record version. */
export async function openSeed(record: SealedSeed, passphrase: string): Promise<{ seed: Uint8Array; wrap: WrapKey }> {
  if (record.v !== 1) throw new Error(`unsupported sealed-seed version ${String(record.v)}`);
  const wrap = await deriveWrapKey(passphrase, record.salt, record.kdf);
  return { seed: decrypt(wrap.key, record.blob, AAD), wrap };
}
