# Production deployment

The grown-up way to run Mneme: a self-hosted, LAN-reachable stack with real HTTPS, restart-on-crash,
and rolling backups. This is the setup to use if you actually intend to keep your journal here. The
root `docker-compose.yml` (the one in the quick-start) is the **dev** stack — published ports, `_dev`
default secrets, plain HTTP. Lovely for hacking, entirely unsuitable for your real diary. Please don't
confuse the two.

For day-two operations (backups, restore, upgrades, health checks, troubleshooting) see
[MAINTENANCE.md](./MAINTENANCE.md). For what the relay exposes, see [API.md](./API.md).

---

## What you get

A four-container stack, reachable from your local network only:

```
browser ──https──> web (Caddy :443, everything under /mneme)
                     ├── /mneme/v1/*, /healthz, /readyz, /admin* ──> server :8080 (prefix stripped)
                     └── everything else under /mneme/: client SPA (static)
                                              server ──> postgres, minio (internal network only)
```

Only ports **80/443** are published on the host. Postgres, MinIO, and the relay are reachable solely
on the compose-internal network — the database is not sitting on the internet waiting to make friends.

The pieces:
- **Caddy (`web`)** — serves the built client and reverse-proxies the relay on one HTTPS origin.
- **`server`** — the Go relay `journald`.
- **`postgres`** — bookkeeping + opaque ciphertext blobs.
- **`minio`** — encrypted media chunks (S3-compatible).

Everything is driven through `./deploy/prod.sh`, a thin wrapper that pins the prod compose file and
your `.env.prod` so you can't accidentally run the wrong stack at 2 a.m.

---

## Prerequisites on the host

Docker Engine + the Compose plugin, enabled at boot, and a clone of this repo.

```bash
# Docker (Debian/Ubuntu; see docs.docker.com for other distros)
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # then log out/in so `docker` works without sudo

git clone <this-repo> mneme && cd mneme
```

---

## First start

```bash
cp .env.prod.example .env.prod    # then fill in real secrets — see below
./deploy/prod.sh up -d --build    # build images + start postgres, minio, relay, caddy
./deploy/prod.sh ps               # everything Up / healthy?
curl -k https://<LAN-IP>/mneme/readyz   # relay ready through the proxy
```

Open **`https://<LAN-IP>/mneme/`** (a bare `/` redirects there). Generate or restore a recovery
phrase and you're in.

### Configuring `.env.prod`

`.env.prod` is gitignored. Never commit it. Fill in:

| Variable | What it is |
|---|---|
| `POSTGRES_PASSWORD` | Postgres superuser password (opaque blobs only, but still — pick a real one). |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO root creds; the relay reuses them as its S3 credentials. |
| `ADMIN_TOKEN` | Bearer token for `/admin`. **Leave empty to disable the admin surface entirely** (every `/admin` path 404s). Generate one with `openssl rand -base64 32`. |
| `SITE_ADDRESS` | Comma-separated addresses Caddy answers on (LAN IP, hostname). The client bundle is hostname-agnostic, so list whatever your LAN resolves. |
| `DEFAULT_SNI` | Certificate served when a client connects by bare IP (sends no SNI). |
| `BACKUP_HOST_DIR` | Host directory where rolling backup archives land (created if missing). |
| `BACKUP_INTERVAL` / `BACKUP_KEEP` | Backup cadence (e.g. `24h`) and how many to keep (newest first; `0` keeps all). |

---

## HTTPS on a LAN (why, and how to stop the browser sulking)

The client requires a **secure context** (OPFS local database, camera/mic capture), so plain
`http://<ip>` simply will not work — the browser disables half the app. Caddy issues certificates from
its own internal CA (`tls internal`):

- **Quick path:** open the site and accept the browser warning once per device. Slightly grubby, works
  immediately.
- **Clean path:** install Caddy's root cert on your devices so the warning disappears for good:

  ```bash
  ./deploy/prod.sh cp web:/data/caddy/pki/authorities/local/root.crt .
  # then import root.crt as a trusted CA on each device and restart the browser
  ```

The CA and issued certs persist in the `caddy_data` volume, so they survive restarts and redeploys.

---

## Deploying a new version

```bash
./deploy/prod.sh up -d --build    # rebuild images + rolling restart
./deploy/prod.sh ps               # confirm healthy
```

Changed `SITE_ADDRESS`? `./deploy/prod.sh restart web` to pick it up. Stopping the stack while keeping
all data is `./deploy/prod.sh down` (note: `down -v` **destroys the volumes** — that's your entire
dataset, so don't, unless you mean it).

---

## Staying up on its own

Every service has `restart: unless-stopped`, and the Docker daemon is enabled at boot, so the stack
comes back by itself after a power cycle or a crash — no 3 a.m. heroics required. Data lives in named
volumes (`pgdata`, `miniodata`, `caddy_data`, `caddy_config`) plus the backup bind mount.

---

## What deployment does *not* buy you

The E2EE model means none of this changes the fundamental deal: an archive, a database dump, or a full
MinIO bucket is **useless without a user's 12-word recovery phrase**, and a forgotten phrase is
unrecoverable — from backups too. You are hosting encrypted blobs beautifully. You still can't read
them, and neither can anyone who steals the box. That's the feature.

Next: [MAINTENANCE.md](./MAINTENANCE.md) for backups, restore, upgrades, and the operations crib sheet.
