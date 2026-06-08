# journald — the Mneme relay

A deliberately dumb, owner-scoped, encrypted-blob relay in Go. It stores opaque
ciphertext and metadata and **never** sees plaintext, keys, or the mnemonic
(CLAUDE.md §1, §7). Last-write-wins sync is a single integer comparison per entry.

## Run it

```bash
# From the repo root: bring up Postgres (+ MinIO) and the server.
docker compose up -d

# Or run the server directly against a local Postgres:
cd server
cp .env.example .env            # adjust if needed
export $(grep -v '^#' .env | xargs)
go run ./cmd/journald
```

Migrations apply automatically on startup (forward-only, embedded). Liveness at
`GET /healthz`, readiness (pings Postgres) at `GET /readyz`.

## Test

```bash
go test ./...                   # unit tests, no database needed

# End-to-end against a real Postgres (full device handshake + sync):
docker compose up -d postgres
TEST_DATABASE_URL=postgres://journal:journal_dev@localhost:5432/journal?sslmode=disable \
  go test -tags e2e ./e2e/...
```

## API

Binary fields are standard base64. Authenticated routes need
`Authorization: Bearer <token>` and are strictly scoped to the session's `owner_id`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/healthz` | – | liveness |
| GET  | `/readyz` | – | readiness (DB ping) |
| POST | `/v1/register` | – | create owner (TOFU) + bind a device |
| POST | `/v1/auth/challenge` | – | get a random challenge for a device |
| POST | `/v1/auth/verify` | – | sign the challenge → session token |
| POST | `/v1/sync/push` | ✅ | upload encrypted entry blobs (LWW on `lww_clock`) |
| POST | `/v1/sync/pull` | ✅ | download entries changed since a cursor |
| GET  | `/v1/reminders` | ✅ | list reminders |
| PUT  | `/v1/reminders` | ✅ | create / reschedule a reminder |
| DELETE | `/v1/reminders/{id}` | ✅ | delete a reminder |

### Auth model

- Device keypair is **Ed25519** (challenge-response). The owner identity pubkey
  (X25519, derived from the seed) is recorded but opaque to the server.
- `owner_id` / `device_id` = `base64url(sha256(pubkey))`.
- Session tokens are random strings, stored only as `sha256(token)` — **not** content keys.
  Verifying a signature is the *only* crypto the server does; it never decrypts anything.

## Layout

```
server/
├── cmd/journald/         # main: connect, migrate, serve, background workers
├── internal/
│   ├── api/              # HTTP handlers, router, Bearer-token middleware
│   ├── store/            # pgx queries + embedded migration runner
│   ├── reminders/        # scheduler (claims due reminders; logs for now)
│   ├── blobs/            # media object-storage seam (stub — §10 step 5)
│   └── config/           # env config
├── migrations/           # forward-only SQL (embedded into the binary)
└── e2e/                  # tagged integration test (needs Postgres)
```

## Not yet wired (later build steps)

- **Media** (`internal/blobs`): chunked encrypted uploads to MinIO/Garage — §10 step 5.
- **Push delivery**: the scheduler claims due reminders but only logs them; Web Push /
  APNs / FCM transport is §10 step 6.
- **Device pairing hardening**: registration is trust-on-first-use; authorizing an
  additional device under an existing owner is the §6 pairing flow (TODO in `auth.go`).
