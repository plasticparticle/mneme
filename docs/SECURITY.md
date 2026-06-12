# Security model

This document describes Mneme's end-to-end encryption, the cryptographic building blocks, and — just
as importantly — the **attack vectors and known weaknesses we are aware of**. Listing a threat here
does not mean it's solved; it means it's tracked. Each item has a status:

- ✅ **Mitigated** — addressed by design or implementation.
- ⚠️ **Accepted** — a conscious tradeoff we are not "fixing" (usually a metadata leak).
- 🔧 **Open** — a real gap with no implementation yet; do not assume protection.

> This is a self-hosted, pre-1.0 project. It has **not** had an external security audit. Treat the
> guarantees below as design intent backed by the current code, not as certified assurances.

---

## 1. What we're protecting, and from whom

**Asset:** the content of journal entries (and, later, media) — the most private thing a person owns.

**Adversary (primary):** the **server operator**. In Mneme's threat model the person running the
relay is *outside* the trust boundary. They control the server, the database, and the network it sees,
and we still don't let them read your journal. This is the whole point — a family self-hosts on a
homelab, and even the admin (a family member) cannot read another member's diary.

**Also considered:** a network attacker (TLS), a thief who steals an unlocked device, and someone who
compromises the server and tries to attack clients through it.

**The trust boundary:**

```
   TRUSTED (your unlocked device)        |   UNTRUSTED (everything else)
   ─────────────────────────────────────┼──────────────────────────────────
   mnemonic, derived keys, plaintext     |   relay (journald), Postgres,
   entries, the client code in RAM       |   MinIO, the network, the admin
                                         |   → sees only ciphertext + metadata
```

**Consequence, by design:** there is **no admin recovery path**. The only recovery anchor is the
12-word mnemonic held by the user. Forgotten mnemonic = data permanently, cryptographically lost.
This is a deliberate availability tradeoff in exchange for confidentiality.

---

## 2. What is and isn't protected

| | Protected (encrypted) | Visible to the server (metadata) |
|---|---|---|
| Entry title & body | ✅ | — |
| Entry labels | ✅ (inside the blob) | — |
| Entry templates | ✅ (ride the entry oplog; kind is inside the ciphertext) | — |
| Media bytes (video/audio/image/file) | ✅ chunked | size, chunk count |
| Media mime/duration/entry-linkage | ✅ (inside the entry blob) | — |
| — | — | ⚠️ number of entries (≈ writing frequency) |
| — | — | ⚠️ blob sizes |
| — | — | ⚠️ edit timing (via `lww_clock`, see §7) |
| — | — | ⚠️ reminder times (`fire_at` is cleartext) |
| — | — | ⚠️ `owner_id` (links a person's devices together) |
| — | — | ⚠️ IP address / connection timing |

**E2EE protects content, not shape.** The server learns *that* you wrote, roughly *how often*, and
*how big* — never *what*.

The operator's **admin dashboard** (`/admin`, enabled only by `ADMIN_TOKEN`; see
[API.md](./API.md#admin)) surfaces strictly a subset of the right-hand column: per-vault storage
footprints (pseudonymous truncated owner ids) and owner-less daily aggregates (`usage_daily` has no
owner column by design). It adds **no new observation capability** — everything it shows, an admin
with database access could already query.

### The opt-in AI assistant — a deliberate, user-consented exception

The client ships an **off-by-default** AI assistant (`apps/client/src/ai/`): "Ask my journal" Q&A
and editor writing help. It is entirely client-side — **the relay is never involved and gains no
new visibility whatsoever**. But when the user enables the *cloud* backend (their own Anthropic API
key), the entries selected as context for a question are sent, **decrypted, over HTTPS to the model
provider**. That is a voluntary extension of the user's trust boundary to a provider of their
choice — not a weakening of the relay threat model. Guardrails: the feature is opt-in with the
consequence spelled out in the settings UI; a fully local backend (Ollama) is offered where nothing
leaves the device; the API key is stored sealed (XChaCha20 under an HKDF key derived from the vault
seed, `ai/settings.ts` — only openable while unlocked, re-sealed on phrase rotation, cleared on
vault deletion); chat transcripts are memory-only and never persisted or synced. The one invariant
that must never break: **journal plaintext must never be routed through the relay as an AI proxy.**

---

## 3. Cryptographic building blocks

All cryptography runs **in the client**, once, for every shell (the PWA has no Rust/Go to host it).
The server does exactly one cryptographic operation: **verifying an Ed25519 signature** for auth — it
never decrypts anything.

| Purpose | Primitive | Library |
|---|---|---|
| Recovery phrase | BIP39, 128-bit, 12 words | `@scure/bip39` |
| Seed → keys | HKDF-SHA256 (salt `"journal-v1"`) | `@noble/hashes` |
| Entry encryption | XChaCha20-Poly1305 (AEAD), random 24-byte nonce | `@noble/ciphers` |
| Owner identity | X25519 (for future sealed-box pairing) | `@noble/curves` |
| Device auth | Ed25519 (challenge-response signatures) | `@noble/curves` |
| Hashing / IDs | SHA-256 | `@noble/hashes` |

**Why `@noble`/`@scure` (paulmillr):** audited, dependency-light, synchronous (no wasm init), and
tree-shakeable. This is a **recorded override** of the original "libsodium-wasm" decision
(CLAUDE.md §3, dated 2026-06-09); the §6 primitives themselves are unchanged.

**Why XChaCha20-Poly1305, not AES-GCM:** the 192-bit (24-byte) nonce makes random-nonce collisions
negligible, so we never need a nonce counter or nonce-management discipline — a frequent source of
catastrophic AEAD failures.

**Ciphertext envelope** (`[version:1B][nonce:24B][ct+tag]`): every blob is version-prefixed so the
primitive can be rotated later without ambiguity. See [ARCHITECTURE.md §5](./ARCHITECTURE.md).

---

## 4. Key lifecycle & at-rest storage

```
mnemonic ──derive──▶ {data_key, owner X25519, device Ed25519}  (in RAM only)
```

- **In memory while unlocked is unavoidable** for any client-side crypto — the keys must exist in
  process memory to encrypt/decrypt.
- **Keys at rest, today:** _nothing is persisted by default_ — the identity lives in memory only and
  you re-enter the mnemonic on every cold start. ✅ Optionally (an explicit onboarding choice, "stay
  signed in on this device"), the BIP39 seed is sealed under an **Argon2id** passphrase-derived key
  (`crypto/seedlock.ts`: Argon2id 64 MiB / t=3 / p=1 → XChaCha20-Poly1305 with the standard
  version-byte envelope and a purpose-binding AAD) and stored in IndexedDB (`platform/keystore.ts`).
  Cold start then asks for the passphrase instead of the phrase; a wrong passphrase fails the AEAD
  tag. KDF parameters are stored inside the record, so they can be raised later without breaking old
  seals. Signing in with the phrase but skipping the passphrase clears any stored seal; phrase
  **rotation re-seals the new seed** under the kept wrap key (and clears the seal if that fails — a
  record that would "unlock" into the wiped old identity is worse than none). The sealed record is an
  offline-brute-forceable artifact for whoever obtains the disk; the slow KDF and the passphrase's
  strength are all that stand in the way, and the UI says so. **Auto-lock after 15 min of
  inactivity** drops the in-memory keys whenever a seal exists; a manual "Lock journal" control
  exists on both layouts.
- **Data at rest, today:** the journal itself **is persisted in plaintext** on the device — a
  per-owner wa-sqlite database in the browser's origin-private file system (OPFS) holds entries,
  media bytes, and templates (CLAUDE.md §5a: "alles im Klartext, weil nur auf dem entsperrten
  Gerät"). This is the deliberate local-first design, but it means device-level protection (OS disk
  encryption, browser-profile isolation) is what stands between a device thief and the data — see
  §6.11. ⚠️ **Accepted** (with at-rest hardening tracked below).
- **At rest, planned:** Tauri → OS keychain (Stronghold) unlocked by OS biometrics. (CLAUDE.md §6.)
  🔧 **Open** — the PWA half (Argon2id-sealed seed in IndexedDB, or nothing stored) is ✅ done, above.

The device key is derived from the seed (`info="device"`) rather than generated per-device, so the
mnemonic alone fully reconstructs a working device. (Tradeoff: today there is effectively one logical
device identity per mnemonic; true per-device keys are a later refinement.)

**Phrase rotation (leaked-mnemonic response).** ✅ A mnemonic cannot be changed in place — every key
and the `owner_id` derive from it — so "Replace recovery phrase" (sidebar/settings) performs a full
migration (`sync/rotate.ts`): generate a new phrase, re-encrypt every entry and media object under
the new keys, push them as a brand-new owner, then `DELETE /v1/account` on the old owner. The old
account is wiped only after the vault is fully stored under the new one; any earlier failure leaves
it intact, and retrying with the same new phrase is idempotent. After rotation the leaked phrase
authenticates (TOFU) into an *empty* vault, the old session tokens are dead, and the old per-owner
local OPFS database is destroyed. Caveat: rotation removes ciphertext going forward — it cannot
retract copies an attacker already exfiltrated while the old phrase was valid.

---

## 5. Authentication & tenant isolation

- **Registration** binds an `owner_id` (from the seed) to a device pubkey. It's **trust-on-first-use**.
- **Auth** is Ed25519 challenge-response: the relay issues a random challenge (2-min, single-use), the
  device signs it, the relay verifies against the stored device pubkey and issues a random **session
  token** (default 24 h). The token is stored only as `sha256(token)` — a database leak does not yield
  usable tokens. ✅
- **Isolation:** every authenticated handler derives `owner_id` from the session principal, never from
  the request body, so one tenant can't touch another's rows. ✅ (Covered by the `e2e` test.)

---

## 6. Attack vectors

### 6.1 Malicious or compromised server serving client code — 🔧 Open (the big one)
The classic weakness of *all* browser-delivered E2EE: if the same server that stores your ciphertext
also serves the web app, a compromised server can ship **malicious JavaScript that exfiltrates keys or
plaintext** the moment you unlock. End-to-end encryption can't protect you from a backdoored client.
- **Mitigations (planned):** ship the **Tauri shells** (signed, updated out-of-band) as the serious
  client; serve the PWA from a host *separate* from the relay; Subresource Integrity; reproducible
  builds; a strict CSP. **None are in place yet.** For now, run the relay and the app from sources you
  control.

### 6.2 XSS / supply-chain in the client — 🔧 Open
Keys live in RAM while unlocked, so any script injection (an XSS hole, a hostile npm dependency) can
read them.
- **Mitigations:** strict **Content-Security-Policy** (not yet configured), auto-lock on inactivity
  (not yet), keys never written to the DOM or logs (followed), pinned dependencies + lockfile +
  `pnpm audit` (lockfile committed; audit not yet in CI), minimal vetted crypto deps (`@noble`).

### 6.3 Server reads content — ✅ Mitigated
The server stores opaque `BYTEA` and compares only integers. It holds no keys and does no decryption.
Confidentiality does not depend on the server behaving — only availability does (§6.7).

### 6.4 Network attacker (MITM) — ⚠️/🔧
Content is already ciphertext, but tokens and metadata transit the wire. **TLS is required in
production.** Dev runs over plain HTTP on localhost. CORS is configurable (`CORS_ORIGINS`); the dev
default reflects any origin and must be tightened in production. 🔧 TLS termination is deployment's job
and not yet documented as enforced.

### 6.5 Rogue device registration / data poisoning — 🔧 Open
Registration proves possession of the *device* key and is trust-on-first-use; it does **not** prove
possession of the *seed*. An attacker who learns your `owner_pubkey` (e.g. from a future sealed-pairing
leak) could register a device and **push garbage blobs** (a poisoning/DoS nuisance) — though they still
**cannot decrypt** anything. Proper authorization (signing registration with the owner identity key, or
an existing-device approval flow) is tied to the §6 multi-device pairing work. Also: **no rate limiting**
yet, so registration/challenge spam is possible.

### 6.6 Replay — ✅ Mitigated
Challenges are single-use and expire (2 min); sessions expire. Replaying a `sync/push` is harmless —
LWW makes it idempotent (a non-newer clock is ignored).

### 6.7 Server withholds or deletes data — ⚠️ Accepted (availability, not confidentiality)
A malicious server can refuse to return blobs or drop them. E2EE is about confidentiality/integrity of
*content*, not availability. Multi-device replication and local-first storage reduce the blast radius
(your unlocked device still has the data).

### 6.8 Metadata & traffic analysis — ⚠️ Accepted
Entry counts, blob sizes, edit cadence, reminder times, and `owner_id`↔device linkage are visible (§2).
We do not pad, batch, or cover-traffic these. E2EE protects content, not shape.

### 6.9 `lww_clock` leaks edit timestamps — 🔧 Open (sharper than "edit frequency")
`lww_clock` is currently wall-clock `Date.now()` in milliseconds, so the server learns the **real time**
of each edit, not merely how often you write. CLAUDE.md §3 accepts "edit frequency"; wall-clock is a bit
more. Moving to a **Hybrid Logical Clock or Lamport counter** (CLAUDE.md §12 `OPEN`) would remove the
real-time signal while preserving LWW ordering.

### 6.10 Entry IDs leaking chronology — ✅ Mitigated
`entry_id` is a **random 128-bit hex** value (`src/sync/ids.ts`), deliberately **not** a ULID or any
timestamp-encoded id, because the relay sees ids in cleartext and a time-encoded id would leak writing
order. (Note: this intentionally diverges from the "ULID" wording in CLAUDE.md §5a/§11 — the leak-guard
in §3 wins.)

### 6.11 Stolen unlocked device / local exposure — ⚠️/🔧
If a device is stolen while unlocked, the journal is exposed (true of any app). The local wa-sqlite
DB additionally persists the decrypted vault in OPFS (§4), so anyone with access to the OS user
account / browser profile can read it even when the app is "locked" — OS-level disk encryption and
a non-shared user account are the current line of defense. Auto-lock (15 min inactivity when a sealed
seed exists) and the Argon2id seed seal (§4) are in; at-rest encryption of the local *database* is
not. Also beware shoulder-surfing during the recovery-phrase
reveal, clipboard exposure on "copy mnemonic", and screenshots — the UI nudges ("make sure no one is
watching") but cannot enforce these.

### 6.12 Lost mnemonic — ⚠️ Accepted (by design)
No recovery path. This is the deliberate cost of "the admin cannot recover." Users must back up the
phrase offline.

### 6.13 Weak randomness — ✅ Mitigated
All randomness comes from the platform CSPRNG (`crypto.getRandomValues`); mnemonic entropy is 128-bit
BIP39.

---

## 7. Known weaknesses / hardening backlog

In rough priority order:

1. 🔧 **Ship a tamper-resistant client** (Tauri, signed) and/or serve the PWA separately from the relay
   with SRI + strict CSP — closes §6.1, the most fundamental gap for browser E2EE.
2. 🔧 **Content-Security-Policy** in the client (auto-lock is ✅ in) — reduces §6.2. Any future CSP
   needs `connect-src` for the relay origin plus, for the AI assistant, `https://api.anthropic.com`
   and the user's Ollama origin (default `http://localhost:11434`).
3. 🔧 **At-rest key protection, Tauri half** (OS keychain) — the PWA's Argon2id seal is ✅ in — §4, §6.11.
4. 🔧 **Harden device registration** (prove seed possession; existing-device approval) + **rate limiting**
   — §6.5.
5. 🔧 **HLC/Lamport `lww_clock`** to stop leaking real edit times — §6.9.
6. 🔧 **Production deployment guide**: enforce TLS, set `CORS_ORIGINS` to the real client origin, rotate
   the MinIO/Postgres dev credentials.
7. 🔧 **External security review** before any 1.0 / real-data use.

---

## 8. Reporting

No private data should ever reach the server in plaintext — if you find a way it can, that's a
top-severity bug. Until a dedicated channel exists, report security issues privately to the maintainer
rather than opening a public issue.
