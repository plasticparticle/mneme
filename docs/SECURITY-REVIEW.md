# Security Review — Mneme

**Date:** 2026-06-09
**Scope:** `apps/client/` (crypto, sync, local DB, onboarding) and `server/` (relay: auth, sync, store, reminders).
**Reviewer:** code-level audit against the threat model in `CLAUDE.md` §1/§3 and the deep-dive in [`SECURITY.md`](SECURITY.md).

This document records security flaws found by reading the current code. It is a point-in-time
review of a pre-1.0 codebase; several findings are already flagged with `TODO`s in the source.
Severities reflect impact **within the project's own stated threat model** — the relay operator is
*outside* the trust boundary, so "a malicious relay can do X" is a real finding, not an accepted risk,
unless `CLAUDE.md` §3 explicitly lists X as an accepted leak.

## Summary

| # | Severity | Title | Area |
|---|----------|-------|------|
| 1 | High | AEAD does not authenticate `entry_id`, `deleted`, or `lww_clock` (relay can relabel / resurrect / pin entries) | client crypto / sync |
| 2 | High | No Content-Security-Policy — the one mitigation the design relies on for in-memory keys is absent | client |
| 3 | High | Owner binding at `/v1/register` is unauthenticated (anyone with the owner pubkey can attach a device) | server auth |
| 4 | Medium | No auto-lock / key lifetime limit — data key lives in memory indefinitely | client |
| 5 | Medium | LWW clock is attacker-controllable client wall-clock — future-dated writes pin an entry permanently | client / server |
| 6 | Medium | No rate limiting or abuse controls on any endpoint (auth brute-force, challenge-table flooding, enumeration) | server |
| 7 | Medium | Relay can silently roll back, drop, or reorder entries (no freshness/completeness proof) | protocol |
| 8 | Low | Recovery phrase written to the system clipboard | client onboarding |
| 9 | Low | External Google Fonts: privacy leak, no SRI, weakens local-first/CSP story | client |
| 10 | Low | Device/owner enumeration via distinct error responses | server auth |
| 11 | Low | Relay serves plain HTTP with no HSTS; TLS is entirely deployment-dependent | server / deploy |
| 12 | Info | Hardening notes (session revocation, CORS default, dev secrets) | mixed |

Positives worth recording: all Postgres access uses parameterized `pgx` queries (no SQL injection
surface); the local SQLite `search()` correctly escapes `LIKE` wildcards; session tokens are random
32-byte values stored only as SHA-256 hashes; challenges are single-use and TTL-bounded; the
ciphertext format carries a version byte from day one (§3); entry IDs are random, not time-encoded
(§3 leak-guard upheld).

---

## 1. High — AEAD does not bind `entry_id`, `deleted`, or `lww_clock`

**Location:** `apps/client/src/crypto/aead.ts` (`encrypt`/`decrypt`), `apps/client/src/sync/engine.ts`
(`encryptEntry`, `pullEntries`), `apps/client/src/db/index.ts` (`mergeRemote`).

**What:** Entry bodies are sealed with XChaCha20-Poly1305 but **no associated data (AAD) is passed**.
The fields the relay actually keys on and returns in cleartext — `entry_id`, `deleted`, `lww_clock`
(`updatedAt`) — are outside the authenticated envelope. The encrypted `EntryBody` does not even
contain its own `entry_id`. On pull, the client trusts the relay's framing verbatim:

```ts
// engine.ts — deleted/id/clock come straight from the relay, unauthenticated
return { id: item.entry_id, /* … */ deleted: item.deleted, updatedAt: body.updatedAt };
```

**Impact (relay is untrusted, §1):** A malicious or compromised relay can, without ever breaking
encryption:
- **Relabel** ciphertext — return entry A's blob under entry B's `entry_id`. The AEAD tag still
  verifies; the client silently shows the wrong entry under the wrong id, and a later edit overwrites
  the wrong row.
- **Resurrect or delete** any entry by flipping the cleartext `deleted` flag it returns on pull.
- **Pin** an entry by returning an inflated `lww_clock`, so the victim's genuine future edits are
  rejected by local LWW merge (`mergeRemote` only overwrites when `excluded.updated_at >
  entries.updated_at`).

This is an integrity break against precisely the actor the design declares out-of-trust. E2EE here
protects confidentiality but provides no tamper-evidence over the record set.

**Recommendation:** Bind the immutable framing into the AEAD as associated data:
`xchacha20poly1305(key, nonce, aad)` where `aad = owner_id || entry_id`. Additionally include
`entry_id`, `updatedAt`, and `deleted` *inside* the encrypted `EntryBody`, and on pull reject any
entry whose authenticated inner `entry_id`/`deleted` disagree with the relay's cleartext framing.
That makes relabeling and deleted-flag tampering detectable.

---

## 2. High — No Content-Security-Policy

**Location:** `apps/client/index.html`, `apps/client/vite.config.ts` (no headers configured); no CSP
served by the relay or any meta tag.

**What:** `CLAUDE.md` §6 names a **strict CSP as the primary mitigation** for the unavoidable fact
that the data key lives in WASM/JS memory while unlocked ("In-Memory während entsperrt ist
unvermeidbar … Mitigation: strenge CSP gegen XSS"). No CSP exists anywhere — not in `index.html`, not
as a response header. The page also pulls styles from `fonts.googleapis.com` and uses inline styles
throughout, so a future naive CSP would need careful authoring.

**Impact:** If any XSS reaches the page (dependency compromise, a future rich-media/import path,
TipTap mis-configuration), script runs with full access to the in-memory data key, the mnemonic-derived
identity, and the decrypted local DB. With no CSP there is no second line of defense — the entire
confidentiality guarantee collapses to "there is no XSS, ever."

**Recommendation:** Ship a strict CSP (`default-src 'self'`; no `unsafe-eval`; tightly scoped
`style-src`/`font-src`; `connect-src` limited to the relay origin; `object-src 'none'`;
`base-uri 'none'`; `frame-ancestors 'none'`). Prefer self-hosting fonts (see finding 9) so
`font-src 'self'` is achievable. Deliver it as a response header in production, not just a meta tag.

---

## 3. High — Unauthenticated owner binding at `/v1/register`

**Location:** `server/internal/api/auth.go` (`handleRegister`), `server/internal/store/store.go`
(`RegisterOwnerDevice`).

**What:** Registration verifies that the **device** controls its own Ed25519 private key
(`ed25519.Verify(devicePub, registerMessage(ownerPub, devicePub), sig)`), but nothing proves the
registrant is authorized by the **owner** identity. The owner X25519 key signs nothing; `ownerPub` is
just an attacker-suppliable field. The code already flags this:

```go
// TODO(§6 pairing): require the request to be authorized by the owner identity key
// (or an existing device session) before honest multi-device pairing ships.
```

**Impact:** Anyone who learns a victim's 32-byte X25519 `owner_pubkey` can register a **device they
control** under that victim's `owner_id`, obtain a session scoped to the victim, and then **push
blobs** into and **pull (encrypted) blobs** from the victim's oplog. Confidentiality of bodies holds
(no `data_key`), but the attacker gains **write/DoS** over the victim's journal (garbage entries,
forced deletions via the cleartext `deleted` flag, clock-pinning per finding 5). The most realistic
attacker is the relay operator itself — exactly the out-of-trust party — who stores every
`owner_pubkey`. It also blocks the "honest multi-device pairing" the design wants.

**Recommendation:** Require proof of owner authority to bind a device: either a signature/sealed
token from the owner identity key, or approval from an already-authenticated device session (the §6
QR/sealed-box pairing flow). Until then, document that multi-device registration is unauthenticated
and treat `owner_pubkey` as a write capability.

---

## 4. Medium — No auto-lock; data key has unbounded in-memory lifetime

**Location:** `apps/client/src/state/data.tsx` (`identity`/`session` refs held for the app's
lifetime), `apps/client/src/screens/Onboarding.tsx` (the "unlock" PIN/Face-ID screen is decorative).

**What:** `CLAUDE.md` lists **"auto-lock on inactivity"** as a hard guardrail. The provider keeps
`identity.current` and `session.current` (including `dataKey`) in memory indefinitely; nothing clears
them on idle, tab-hide, or a timer. The returning-device "unlock" screen collects a PIN but never
gates anything — it just routes to `restore`.

**Impact:** On a shared, unattended, or later-compromised device, the decrypted data key and an
active relay session remain usable for as long as the page lives. Weakens the at-rest story the design
explicitly promises.

**Recommendation:** Implement an inactivity timer and `visibilitychange` handler that drops
`identity`/`session` (and resets `status` to `locked`), requiring mnemonic re-entry or a real local
unlock. Make the PIN/biometric screen actually re-derive or release the key.

---

## 5. Medium — LWW clock is attacker-controllable wall-clock

**Location:** `apps/client/src/sync/engine.ts` (`lww_clock: e.updatedAt`), `state/data.tsx`
(`updatedAt: Date.now()`), `server/internal/store/store.go` (`PushEntry` compares only `lww_clock`).

**What:** The last-write-wins clock is the client's `Date.now()` millisecond timestamp, pushed in
cleartext and compared numerically by the server. `CLAUDE.md` §12 even lists "HLC vs. Lamport" as
*open* — today it is neither, just wall-clock.

**Impact:** A device with a skewed/forward clock — or any party with write access (finding 3) —
can set `lww_clock` arbitrarily far in the future (up to `int64`). That version then wins LWW forever,
and the legitimate owner's subsequent edits are silently rejected both server-side and in the local
`mergeRemote` guard. Combined with finding 1's unauthenticated `deleted` flag, an attacker can pin a
permanent tombstone over an entry.

**Recommendation:** Adopt a hybrid logical clock (bounded drift vs. server time) or have the server
reject clocks implausibly far ahead of `now()`. Authenticate the clock inside the AEAD (finding 1) so
the relay cannot rewrite it.

---

## 6. Medium — No rate limiting or abuse controls

**Location:** `server/internal/api/*` — no middleware between `cors`/`logging` and the handlers.

**What:** None of `/v1/register`, `/v1/auth/challenge`, `/v1/auth/verify`, `/v1/sync/*`, or
`/v1/reminders` is rate-limited. `/v1/auth/challenge` inserts a row per call (`SaveChallenge`) with no
cap on outstanding challenges per device.

**Impact:**
- **Challenge-table flooding / DoS:** unauthenticated repeated `/challenge` for any known `device_id`
  grows `auth_challenges` until the 15-minute purge loop runs.
- **Online auth brute-force surface:** unlimited `/verify` attempts per live challenge (Ed25519 makes
  forgery infeasible, but the lack of throttling is a general resource/abuse concern).
- **Push abuse:** an authenticated owner can push up to the 32 MiB body cap repeatedly; no per-owner
  storage or request quota.

**Recommendation:** Add per-IP and per-device rate limiting (challenge issuance especially), cap
outstanding challenges per device, and consider per-owner storage quotas. Run the purge loop more
aggressively or bound the table.

---

## 7. Medium — Relay can roll back, drop, or reorder the record set

**Location:** protocol-level — `server/internal/api/sync.go` (`handlePull`), client `pullEntries`.

**What:** The pull protocol has no freshness or completeness proof. The relay decides which entries,
at which versions, in which order, the client sees. Per-blob AEAD authenticates each blob's *body* but
nothing binds the *set* (no signed manifest, no monotonic-version attestation).

**Impact:** A malicious relay can serve a stale ciphertext for an entry (rollback to an earlier
plaintext the user revised away), omit entries entirely, or withhold a deletion — none detectable by
the client. This is within the declared "server is untrusted" model and is **not** on the §3 accepted-
leaks list, so it is a genuine gap rather than an accepted trade-off.

**Recommendation:** Have the client maintain a locally-trusted high-water mark per entry (it largely
does, via the local DB as source of truth) and treat a remote `lww_clock` lower than the local one as
suspect rather than silently ignoring. For stronger guarantees, a client-signed, monotonically
versioned per-entry counter inside the AEAD lets a client detect rollback across its own devices.

---

## 8. Low — Recovery phrase copied to the system clipboard

**Location:** `apps/client/src/screens/Onboarding.tsx` (`Copy` button → `navigator.clipboard.writeText`,
and `pasteFromClipboard`).

**What:** The 12-word mnemonic — which *is* the account and the only recovery anchor — can be written
to the OS clipboard.

**Impact:** Clipboard contents are readable by other local apps, often synced to clipboard history /
cross-device clipboards, and persist after navigation. For a secret of this consequence that is a
meaningful exposure.

**Recommendation:** Discourage clipboard copy for the phrase, or auto-clear it after a short timeout
and warn the user. Prefer manual transcription (the UI already encourages writing it down).

---

## 9. Low — External Google Fonts

**Location:** `apps/client/index.html` (`fonts.googleapis.com` / `fonts.gstatic.com`).

**What:** Fonts load from Google's CDN with no Subresource Integrity.

**Impact:** Leaks user IP / per-visit timing to a third party (at odds with the local-first, "nothing
leaves the device" positioning), adds an availability dependency, and forces a looser `font-src` in
any future CSP (finding 2).

**Recommendation:** Self-host the WOFF2 files and serve them from the app origin.

---

## 10. Low — Device/owner enumeration

**Location:** `server/internal/api/auth.go` (`handleChallenge` returns 404 "unknown device";
`handleRegister` echoes derived ids).

**What:** Distinct responses let an unauthenticated caller probe whether a given `device_id` exists.

**Impact:** Minor metadata oracle; `device_id` is itself a hash of a public key, so the leak is
limited, but it aids targeting of finding 3/6.

**Recommendation:** Return uniform responses/timing for unknown vs. known devices on the public auth
endpoints where feasible.

---

## 11. Low — Plain HTTP server, no HSTS

**Location:** `server/cmd/journald/main.go` (`srv.ListenAndServe`, no TLS); no security headers.

**What:** The relay listens over plain HTTP and relies entirely on an external reverse proxy for TLS.
No HSTS or other security headers are emitted.

**Impact:** TLS — the *one* piece of server-side crypto the design keeps — is wholly deployment-
dependent and silently absent if the proxy is misconfigured. Bearer tokens and `owner_pubkey`s would
then traverse the network in clear.

**Recommendation:** Document the mandatory TLS-terminating proxy as a hard requirement, emit HSTS
(via proxy or app), and consider refusing to start in a production mode without a trusted-proxy
assertion.

---

## 12. Info — Hardening notes

- **Session lifecycle:** 24 h tokens with no revocation/refresh endpoint and no logout. Add a
  revoke-session / revoke-device path (`sessions` and `devices` rows exist to support it).
- **CORS default:** `CORS_ORIGINS` defaults to `*` (reflect any origin). Auth is Bearer-only so CSRF
  risk is low, but production should pin an allowlist; ensure the default is overridden in deployment.
- **Dev secrets:** `config.go` and `docker-compose.yml` ship `journal_dev` / `minioadmin_dev`
  defaults. These are dev-only by intent — confirm deployment tooling forbids them in production.
- **`deleted`/`lww_clock` trust:** see findings 1 and 5 — these cleartext fields are honored without
  authentication; folding them into the AEAD closes several issues at once.

---

## Suggested remediation order

1. **Finding 1** (AEAD AAD + in-body `entry_id`/`deleted`/clock) — closes 1, hardens 5 and 7, cheap.
2. **Finding 2** (CSP) — restores the design's stated XSS mitigation for in-memory keys.
3. **Finding 3** (authenticated owner binding) — closes the write/DoS path and unblocks real pairing.
4. **Findings 4–6** (auto-lock, clock sanity, rate limiting) — defense-in-depth.
5. **Findings 8–12** — privacy/hardening polish.
