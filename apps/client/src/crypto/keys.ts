// Key derivation (CLAUDE.md §6). seed → HKDF-SHA256 → data/media keys + identity.
//
// NOTE: the locked decision (§3) named libsodium-wasm; this implementation uses the
// audited @noble/@scure stack instead — a deliberate, recorded override. The §6
// derivation (BIP39 → HKDF-SHA256 → keys; X25519 owner, Ed25519 device) is unchanged.
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { ed25519, x25519 } from '@noble/curves/ed25519';
import { utf8 } from './bytes';
import { toBase64Url } from './base64';

const SALT = utf8('journal-v1');
const KEY_LEN = 32;

export interface Identity {
  /** XChaCha20-Poly1305 key for entry bodies. */
  dataKey: Uint8Array;
  /** Reserved for chunked media (not used yet). */
  mediaKey: Uint8Array;
  /** X25519 owner public key (for sealed-box pairing). */
  ownerPub: Uint8Array;
  /** base64url(sha256(ownerPub)) — must match the relay's derivation. */
  ownerId: string;
  /** Ed25519 device private key (seed) for challenge-response auth. */
  devicePriv: Uint8Array;
  /** Ed25519 device public key. */
  devicePub: Uint8Array;
}

/**
 * Derive everything from the BIP39 seed. The device key is derived from the seed
 * too (info="device"), so nothing needs to be persisted: the mnemonic regenerates
 * the full identity on every cold start.
 */
export function deriveIdentity(seed: Uint8Array): Identity {
  const dataKey = hkdf(sha256, seed, SALT, utf8('data'), KEY_LEN);
  const mediaKey = hkdf(sha256, seed, SALT, utf8('media'), KEY_LEN);

  const identitySeed = hkdf(sha256, seed, SALT, utf8('identity'), KEY_LEN);
  const ownerPub = x25519.getPublicKey(identitySeed);

  const deviceSeed = hkdf(sha256, seed, SALT, utf8('device'), KEY_LEN);
  const devicePub = ed25519.getPublicKey(deviceSeed);

  return {
    dataKey,
    mediaKey,
    ownerPub,
    ownerId: toBase64Url(sha256(ownerPub)),
    devicePriv: deviceSeed,
    devicePub,
  };
}

/** Ed25519 signature for challenge-response auth and registration. */
export function signWithDevice(devicePriv: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, devicePriv);
}
