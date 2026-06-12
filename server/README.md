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
| PUT  | `/v1/media/{id}/chunks/{n}` | ✅ | upload one encrypted media chunk (raw body) |
| POST | `/v1/media/{id}/complete` | ✅ | finalize an upload (record chunk count) |
| GET  | `/v1/media/{id}` | ✅ | media metadata (ciphertext bytes, chunk count) |
| GET  | `/v1/media/{id}/chunks/{n}` | ✅ | download one encrypted media chunk |
| DELETE | `/v1/media/{id}` | ✅ | delete one media object (idempotent) |
| DELETE | `/v1/account` | ✅ | wipe the owner entirely (recovery-phrase rotation) |
| GET  | `/admin` | – | admin dashboard page (404 unless `ADMIN_TOKEN` is set) |
| GET  | `/admin/stats` | 🔑 | aggregate stats JSON (`Bearer <ADMIN_TOKEN>`) |
| DELETE | `/admin/vaults/{id}` | 🔑 | operator vault wipe (`{"confirm":"delete"}` body required) |

The full request/response shapes live in [`../docs/API.md`](../docs/API.md). Media endpoints
answer `503` when `S3_ENDPOINT` is unset; with it set, chunks stream to S3/MinIO (the bucket is
auto-provisioned) and Postgres keeps only the index row.

### Admin dashboard

For the operator: vault counts, per-vault storage footprints, and owner-less daily usage
counters (requests, records, media, vaults) — health and growth, never *who did what*; the
data for attribution deliberately does not exist server-side (see `../docs/API.md` "Admin").

The token is configured via the `ADMIN_TOKEN` environment variable; when it is unset the
admin surface does not exist (every `/admin` path is a 404). Where to set it:

- **Dev, via compose** — `docker-compose.yml` already sets `ADMIN_TOKEN: admin_dev`.
- **Dev, `go run`** — put it in `server/.env` (gitignored; `.env.example` has the dev default).
- **Production** — inject it as a secret env var on the `journald` process (a root-level
  `.env` file next to your compose file, a systemd `Environment=`/`EnvironmentFile=` drop-in,
  or your orchestrator's secret store). Generate one with `openssl rand -base64 32` and never
  commit it (§11). Omit the variable on deployments that shouldn't expose `/admin` at all.

Then open `http://<relay>/admin` and paste the token (kept in `sessionStorage` only), or
`curl -H "Authorization: Bearer $ADMIN_TOKEN" http://<relay>/admin/stats`.

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
│   ├── blobs/            # media object storage — streams encrypted chunks to S3/MinIO
│   └── config/           # env config
├── migrations/           # forward-only SQL (embedded into the binary)
└── e2e/                  # tagged integration test (needs Postgres)
```

## Not yet wired (later build steps)

- **Push delivery**: the scheduler claims due reminders but only logs them; Web Push /
  APNs / FCM transport is §10 step 6.
- **Device pairing hardening**: registration is trust-on-first-use; authorizing an
  additional device under an existing owner is the §6 pairing flow (TODO in `auth.go`).
- **Public template registry**: the signed-cleartext `public_templates` table from §5b
  (private templates need no server support — they ride the entry oplog as ciphertext).
