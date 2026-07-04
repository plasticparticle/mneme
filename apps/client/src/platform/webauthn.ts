// WebAuthn PRF ceremonies for security-key device unlock (§6 at-rest, the
// FIDO2 sibling of the Argon2id passphrase). The PRF extension returns a
// stable 32-byte secret per (credential, salt); crypto/seedlock.ts turns it
// into the seed wrap key. No server is involved — the credential is
// self-issued and its attestation is discarded.
//
// Caveats (accepted, not solved here):
//  - The credential is bound to this origin's domain (rpId). If the PWA moves
//    domains, PRF unlock stops working — the recovery phrase is the fallback.
//  - Ceremonies require transient user activation: call these from a click
//    handler with the ceremony as the first await.
import { randomBytes } from '../crypto/bytes';

/** The authenticator (or browser) cannot do PRF/hmac-secret. */
export class PrfUnsupportedError extends Error {
  constructor(message = 'this authenticator does not support the PRF extension') {
    super(message);
    this.name = 'PrfUnsupportedError';
  }
}

/** User cancelled, timed out, or the key was not presented. */
export class CeremonyCancelledError extends Error {
  constructor(message = 'security key ceremony was cancelled') {
    super(message);
    this.name = 'CeremonyCancelledError';
  }
}

export function webauthnAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'PublicKeyCredential' in window;
}

// The prf extension is not in TS's lib.dom yet across our toolchain — type the
// slice we use.
interface PrfExtensionResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

// The WebAuthn API wants BufferSource = views over a plain ArrayBuffer; our
// byte helpers are typed Uint8Array<ArrayBufferLike>. A fresh copy narrows it.
function asBuffer(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(u);
}

function prfExtension(salt: Uint8Array): AuthenticationExtensionsClientInputs {
  return { prf: { eval: { first: asBuffer(salt) } } } as AuthenticationExtensionsClientInputs;
}

function mapDomError(err: unknown): Error {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return new CeremonyCancelledError();
    if (err.name === 'SecurityError' || err.name === 'NotSupportedError') return new PrfUnsupportedError(err.message);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function prfSecret(results: PrfExtensionResults): Uint8Array | null {
  const first = results.prf?.results?.first;
  // Copy out of the ArrayBuffer — the credential object doesn't outlive us.
  return first ? new Uint8Array(first.slice(0)) : null;
}

export interface PrfEnrollment {
  credentialId: Uint8Array;
  prfSalt: Uint8Array;
  /** 32-byte PRF output for (credential, prfSalt). */
  secret: Uint8Array;
  rpId: string;
}

/**
 * Create a credential with the PRF extension and evaluate it once. Security
 * keys typically only return PRF output on `get`, so enrollment may run two
 * ceremonies back to back (create, then an immediate assertion).
 */
export async function enrollPrfCredential(): Promise<PrfEnrollment> {
  const prfSalt = randomBytes(32);
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Mneme' }, // id defaults to this origin's domain
        // Identity is meaningless here (nothing verifies it) — random id keeps
        // enrollments distinct on the authenticator.
        user: { id: asBuffer(randomBytes(16)), name: 'mneme journal', displayName: 'Mneme device unlock' },
        // Self-generated challenge; we never verify the attestation.
        challenge: asBuffer(randomBytes(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -8 }, // Ed25519
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
        extensions: prfExtension(prfSalt),
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw mapDomError(err);
  }
  if (!cred) throw new CeremonyCancelledError();

  const ext = cred.getClientExtensionResults() as PrfExtensionResults;
  // A leftover credential on the authenticator after this throw is harmless —
  // it wraps nothing.
  if (ext.prf?.enabled !== true && !ext.prf?.results?.first) throw new PrfUnsupportedError();

  const credentialId = new Uint8Array(cred.rawId.slice(0));
  const rpId = window.location.hostname;
  // Some platform authenticators evaluate at create; security keys need a get.
  const secret = prfSecret(ext) ?? (await evalPrf(credentialId, prfSalt));
  return { credentialId, prfSalt, secret, rpId };
}

/** Run an assertion to obtain the 32-byte PRF output for (credential, salt). */
export async function evalPrf(credentialId: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array> {
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge: asBuffer(randomBytes(32)),
        allowCredentials: [{ type: 'public-key', id: asBuffer(credentialId) }],
        userVerification: 'preferred',
        extensions: prfExtension(prfSalt),
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw mapDomError(err);
  }
  if (!cred) throw new CeremonyCancelledError();
  const secret = prfSecret(cred.getClientExtensionResults() as PrfExtensionResults);
  if (!secret) throw new PrfUnsupportedError();
  return secret;
}
