# Relay HTTP API

The relay (`journald`) is a small JSON-over-HTTP service. Binary fields are **standard base64**
(Go `StdEncoding`); `owner_id` / `device_id` are **base64url without padding** (`sha256(pubkey)`).
Authenticated routes require `Authorization: Bearer <token>` and are strictly scoped to the session's
`owner_id`. Base URL in dev: `http://localhost:8080` (client override: `VITE_RELAY_URL`).

See [ARCHITECTURE.md §6](./ARCHITECTURE.md) for the call sequence and [SECURITY.md](./SECURITY.md) for
the auth model.

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | – | liveness |
| GET | `/readyz` | – | readiness (pings Postgres) |
| POST | `/v1/register` | – | create owner (TOFU) + bind a device |
| POST | `/v1/auth/challenge` | – | random challenge for a device |
| POST | `/v1/auth/verify` | – | sign the challenge → session token |
| POST | `/v1/sync/push` | ✅ | upload encrypted entry blobs (LWW) |
| POST | `/v1/sync/pull` | ✅ | download entries changed since a cursor |
| GET | `/v1/reminders` | ✅ | list reminders |
| PUT | `/v1/reminders` | ✅ | create / reschedule a reminder |
| DELETE | `/v1/reminders/{id}` | ✅ | delete a reminder |

Errors are `{ "error": "message" }` with an appropriate status (400/401/404/500). CORS preflight
(`OPTIONS`) is answered for configured origins (`CORS_ORIGINS`).

---

## Auth

### `POST /v1/register`
The device signs `"mneme:register:" || ownerPub || devicePub` (Ed25519) to prove key possession.
```jsonc
// request
{ "owner_pubkey": "<base64 X25519, 32B>",
  "device_pubkey": "<base64 Ed25519, 32B>",
  "signature":     "<base64 Ed25519 sig>" }
// 200
{ "owner_id": "<base64url>", "device_id": "<base64url>" }
```

### `POST /v1/auth/challenge`
```jsonc
{ "device_id": "<base64url>" }
// 200 — challenge is single-use, expires in 2 minutes
{ "challenge": "<base64>", "expires_at": "RFC3339" }
```

### `POST /v1/auth/verify`
```jsonc
{ "device_id": "<base64url>",
  "challenge": "<base64 from /challenge>",
  "signature": "<base64 Ed25519 sig over challenge bytes>" }
// 200 — token TTL defaults to 24h; server stores only sha256(token)
{ "token": "<opaque>", "owner_id": "<base64url>", "expires_at": "RFC3339" }
```

---

## Sync

### `POST /v1/sync/push`
Last-write-wins per entry on `lww_clock`. The server treats `ciphertext` as opaque bytes.
```jsonc
{ "entries": [
    { "entry_id": "<random hex>",
      "lww_clock": 1717900000000,
      "ciphertext": "<base64 of [version][nonce][ct+tag]>",
      "deleted": false }
] }
// 200 — applied=false means a not-newer clock was ignored
{ "results": [ { "entry_id": "...", "applied": true } ] }
```

### `POST /v1/sync/pull`
```jsonc
{ "since": 0, "limit": 500 }
// 200 — cursor = max seq returned; when cursor == since you're caught up
{ "entries": [
    { "entry_id": "...", "lww_clock": 1717900000000,
      "ciphertext": "<base64>", "deleted": false, "seq": 42 }
  ],
  "cursor": 42,
  "more": false }
```

---

## Reminders

`fire_at` is **cleartext** (an accepted leak — the scheduler needs it; the entry stays encrypted).

```jsonc
// PUT /v1/reminders
{ "reminder_id": "...", "fire_at": "RFC3339" }   // 200 { "reminder_id": "..." }

// GET /v1/reminders  →  200
{ "reminders": [ { "reminder_id": "...", "fire_at": "RFC3339", "dispatched": false } ] }

// DELETE /v1/reminders/{id}  →  204 No Content
```

---

## Quick curl

```bash
curl -s localhost:8080/healthz
curl -s localhost:8080/readyz
```

Registration/auth need real Ed25519 signatures — the easiest way to exercise the full flow is the
client integration script:

```bash
pnpm --filter client exec tsx scripts/integration.ts
```
