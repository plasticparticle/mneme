// At-rest seed protection (§6 "PWA at-rest"): the BIP39 seed sealed under a
// wrapping key, for users who opt into staying signed in on a device. Opt-in
// only — the default remains "persist nothing, re-enter the phrase on every
// cold start". Two wrap-key sources:
//   - v:1 — Argon2id over a passphrase. The sealed record's cost is being an
//     offline-brute-forceable artifact on disk; the deliberately slow KDF is
//     what makes each guess expensive.
//   - v:2 — a WebAuthn PRF secret from a FIDO2 authenticator (security key /
//     platform passkey). Not brute-forceable offline — the secret lives in the
//     authenticator. The ceremony itself lives in platform/webauthn.ts; this
//     module only takes the raw 32-byte PRF output.
import { argon2idAsync } from '@noble/hashes/argon2';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
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

/** Argon2id-passphrase record — shape identical to the pre-union `v:1`, so
 * existing keystore records keep opening unchanged. */
export interface SealedSeedArgon2 {
  v: 1;
  salt: Uint8Array;
  kdf: KdfParams;
  /** aead.ts blob — [version:1B][nonce:24B][ct+tag] — over the 64-byte seed. */
  blob: Uint8Array;
}

/** WebAuthn-PRF record. The wrap key is HKDF(prf secret); nothing here lets an
 * offline attacker guess it — the secret only exists inside the authenticator. */
export interface SealedSeedPrf {
  v: 2;
  /** Explicit discriminant for future v:2 methods. */
  method: 'prf';
  /** Raw credential id — goes into allowCredentials at unlock. */
  credentialId: Uint8Array;
  /** Random 32-byte PRF eval input, fixed per enrollment. */
  prfSalt: Uint8Array;
  /** Domain the credential is bound to — diagnostics only; unlock uses the origin default. */
  rpId: string;
  /** aead.ts blob over the 64-byte seed. */
  blob: Uint8Array;
}

/** What the keystore persists. Structured-clone-safe (typed arrays + plain values). */
export type SealedSeed = SealedSeedArgon2 | SealedSeedPrf;

export function isSealedSeed(rec: unknown): rec is SealedSeed {
  const v = (rec as { v?: unknown } | null | undefined)?.v;
  return v === 1 || v === 2;
}

export interface WrapKeyArgon2 {
  method: 'argon2';
  key: Uint8Array;
  salt: Uint8Array;
  kdf: KdfParams;
}

export interface WrapKeyPrf {
  method: 'prf';
  key: Uint8Array;
  credentialId: Uint8Array;
  prfSalt: Uint8Array;
  rpId: string;
}

/**
 * The wrapping key together with what it takes to re-emit its record. Held in
 * memory while unlocked so phrase rotation can re-seal the new seed without
 * asking for the passphrase / running another ceremony.
 */
export type WrapKey = WrapKeyArgon2 | WrapKeyPrf;

// Pins the ciphertext to this purpose: a sealed seed can't be replayed where an
// entry blob is expected, nor the other way around. Per-method AADs also pin a
// blob to its record kind.
const AAD = utf8('mneme:seedlock:v1');
const AAD_PRF = utf8('mneme:seedlock:prf:v1');

async function deriveWrapKey(passphrase: string, salt: Uint8Array, kdf: KdfParams): Promise<WrapKeyArgon2> {
  // argon2idAsync yields to the event loop between blocks, so a ~1s derivation
  // doesn't freeze the unlock screen.
  const key = await argon2idAsync(utf8(passphrase.normalize('NFKD')), salt, { ...kdf, dkLen: KEY_LEN });
  return { method: 'argon2', key, salt, kdf };
}

// The PRF output is never used as a key directly — HKDF gives domain separation
// (same salt/style as crypto/keys.ts) in case the secret is ever evaluated for
// another purpose.
function prfWrapKey(secret: Uint8Array): Uint8Array {
  return hkdf(sha256, secret, utf8('journal-v1'), utf8('seedlock-prf'), KEY_LEN);
}

/** Seal the seed under a fresh random salt and the given passphrase. */
export async function sealSeed(seed: Uint8Array, passphrase: string): Promise<{ record: SealedSeed; wrap: WrapKey }> {
  const wrap = await deriveWrapKey(passphrase, randomBytes(SALT_LEN), DEFAULT_KDF);
  return { record: sealWithKey(wrap, seed), wrap };
}

/** Seal the seed under a WebAuthn PRF secret (32 bytes from platform/webauthn.ts). */
export function sealSeedWithPrfSecret(
  secret: Uint8Array,
  meta: { credentialId: Uint8Array; prfSalt: Uint8Array; rpId: string },
  seed: Uint8Array,
): { record: SealedSeedPrf; wrap: WrapKeyPrf } {
  const wrap: WrapKeyPrf = { method: 'prf', key: prfWrapKey(secret), ...meta };
  return { record: sealWithKey(wrap, seed), wrap };
}

/** Re-seal with an existing wrap key — phrase rotation: same factor, new seed. */
export function sealWithKey(wrap: WrapKeyPrf, seed: Uint8Array): SealedSeedPrf;
export function sealWithKey(wrap: WrapKeyArgon2, seed: Uint8Array): SealedSeedArgon2;
export function sealWithKey(wrap: WrapKey, seed: Uint8Array): SealedSeed;
export function sealWithKey(wrap: WrapKey, seed: Uint8Array): SealedSeed {
  if (wrap.method === 'prf') {
    const { credentialId, prfSalt, rpId } = wrap;
    return { v: 2, method: 'prf', credentialId, prfSalt, rpId, blob: encrypt(wrap.key, seed, AAD_PRF) };
  }
  return { v: 1, salt: wrap.salt, kdf: wrap.kdf, blob: encrypt(wrap.key, seed, AAD) };
}

/** Throws on a wrong passphrase (AEAD tag mismatch) or an unknown record version. */
export async function openSeed(record: SealedSeed, passphrase: string): Promise<{ seed: Uint8Array; wrap: WrapKey }> {
  if (record.v !== 1) throw new Error(`unsupported sealed-seed version ${String(record.v)}`);
  const wrap = await deriveWrapKey(passphrase, record.salt, record.kdf);
  return { seed: decrypt(wrap.key, record.blob, AAD), wrap };
}

/** Throws on a wrong secret (AEAD tag mismatch) or an unknown record version. */
export function openSeedWithPrfSecret(record: SealedSeed, secret: Uint8Array): { seed: Uint8Array; wrap: WrapKeyPrf } {
  if (record.v !== 2) throw new Error(`unsupported sealed-seed version ${String(record.v)}`);
  const { credentialId, prfSalt, rpId } = record;
  const wrap: WrapKeyPrf = { method: 'prf', key: prfWrapKey(secret), credentialId, prfSalt, rpId };
  return { seed: decrypt(wrap.key, record.blob, AAD_PRF), wrap };
}
