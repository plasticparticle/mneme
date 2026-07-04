// Regression check for the sealed-seed record union (no browser, no relay):
//   1. v:1 Argon2id seal → open roundtrip (wrong passphrase must throw).
//   2. v:2 PRF seal → open roundtrip with a fake 32-byte secret (the real one
//      comes from a WebAuthn ceremony, which can't run under tsx).
//   3. sealWithKey over both WrapKey arms reproduces openable records — the
//      phrase-rotation re-seal path.
//   4. Cross-version pinning: a v:1 record must not open via the PRF path and
//      vice versa, and swapping a v:2 blob into a v:1 record must fail the AAD.
// Run: pnpm --filter client exec tsx scripts/seedlock-methods.ts
import {
  sealSeed,
  openSeed,
  sealSeedWithPrfSecret,
  openSeedWithPrfSecret,
  sealWithKey,
  isSealedSeed,
  type SealedSeedArgon2,
} from '../src/crypto/seedlock';
import { randomBytes } from '../src/crypto/bytes';

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const seed = randomBytes(64);
const seed2 = randomBytes(64);

// ── 1. v:1 Argon2id roundtrip ───────────────────────────────
const pass = 'correct horse battery staple';
const a = await sealSeed(seed, pass);
if (a.record.v !== 1) fail('argon2 seal did not produce a v:1 record');
if (a.record.blob[0] !== 0x01) fail('v:1 blob is missing the aead version byte');
if (!isSealedSeed(a.record)) fail('isSealedSeed rejected a v:1 record');
const aOpen = await openSeed(a.record, pass);
if (!eq(aOpen.seed, seed)) fail('v:1 roundtrip returned a different seed');
let threw = false;
try {
  await openSeed(a.record, 'wrong passphrase entirely');
} catch {
  threw = true;
}
if (!threw) fail('wrong passphrase opened a v:1 record');
console.log('OK  v:1 argon2 seal/open roundtrip');

// ── 2. v:2 PRF roundtrip ────────────────────────────────────
const secret = randomBytes(32);
const meta = { credentialId: randomBytes(24), prfSalt: randomBytes(32), rpId: 'localhost' };
const p = sealSeedWithPrfSecret(secret, meta, seed);
if (p.record.v !== 2 || p.record.method !== 'prf') fail('prf seal did not produce a v:2/prf record');
if (p.record.blob[0] !== 0x01) fail('v:2 blob is missing the aead version byte');
if (!isSealedSeed(p.record)) fail('isSealedSeed rejected a v:2 record');
if (!eq(p.record.credentialId, meta.credentialId) || !eq(p.record.prfSalt, meta.prfSalt)) fail('v:2 record lost its credential metadata');
const pOpen = openSeedWithPrfSecret(p.record, secret);
if (!eq(pOpen.seed, seed)) fail('v:2 roundtrip returned a different seed');
threw = false;
try {
  openSeedWithPrfSecret(p.record, randomBytes(32));
} catch {
  threw = true;
}
if (!threw) fail('a wrong PRF secret opened a v:2 record');
console.log('OK  v:2 prf seal/open roundtrip');

// ── 3. sealWithKey over both arms (rotation re-seal) ────────
const aRe = sealWithKey(aOpen.wrap, seed2);
if (aRe.v !== 1) fail('argon2 wrap re-seal changed the record version');
if (!eq((await openSeed(aRe, pass)).seed, seed2)) fail('argon2 re-seal did not open with the same passphrase');
const pRe = sealWithKey(pOpen.wrap, seed2);
if (pRe.v !== 2) fail('prf wrap re-seal changed the record version');
if (!eq(openSeedWithPrfSecret(pRe, secret).seed, seed2)) fail('prf re-seal did not open with the same secret');
console.log('OK  sealWithKey re-seal for both methods');

// ── 4. cross-version / AAD pinning ──────────────────────────
threw = false;
try {
  openSeedWithPrfSecret(a.record, secret);
} catch {
  threw = true;
}
if (!threw) fail('a v:1 record opened through the PRF path');
threw = false;
try {
  await openSeed(p.record, pass);
} catch {
  threw = true;
}
if (!threw) fail('a v:2 record opened through the passphrase path');
// Same wrap key, blob transplanted across record kinds → the per-method AAD
// must reject it even though the key would match.
const transplant: SealedSeedArgon2 = { v: 1, salt: randomBytes(16), kdf: { t: 3, m: 64 * 1024, p: 1 }, blob: p.record.blob };
threw = false;
try {
  // Decrypt with the *PRF* wrap key but the v:1 AAD path via a hand-rolled open:
  // openSeed would derive an argon2 key anyway, so exercise the AAD directly.
  const { decrypt } = await import('../src/crypto/aead');
  const { utf8 } = await import('../src/crypto/bytes');
  decrypt(pOpen.wrap.key, transplant.blob, utf8('mneme:seedlock:v1'));
} catch {
  threw = true;
}
if (!threw) fail('a v:2 blob decrypted under the v:1 AAD');
console.log('OK  cross-version and AAD pinning');

console.log('\nseedlock-methods: all checks passed');
