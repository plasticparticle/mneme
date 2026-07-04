# Production deployment (LAN, Docker)

A four-container stack for running Mneme on a home server, reachable from the
local network only: Postgres + MinIO + the Go relay (`server`) + Caddy (`web`),
which serves the built client and reverse-proxies the relay on one origin.

```
browser ──https──> web (Caddy :443, everything under /mneme)
                     ├── /mneme/v1/*, /healthz, /readyz, /admin* ──> server :8080 (prefix stripped)
                     └── everything else under /mneme/: client SPA (static)
                                              server ──> postgres, minio (internal network only)
```

Only ports 80/443 are published on the host; Postgres, MinIO, and the relay
are reachable solely on the compose-internal network.

## First start

```bash
cp .env.prod.example .env.prod   # then fill in real secrets
./deploy/prod.sh up -d --build
./deploy/prod.sh ps              # everything Up / healthy?
curl -k https://192.168.68.71/mneme/readyz  # relay ready through the proxy
```

Open `https://<LAN-IP>/mneme/` (see `SITE_ADDRESS` in `.env.prod`; bare `/`
redirects there). The client is a
static bundle built with `--base=/mneme/` and `VITE_RELAY_URL="/mneme"` — it
talks to the relay via origin-relative URLs, so any address Caddy answers on
works.

## HTTPS on a LAN (why and how)

The client requires a **secure context** (OPFS local database, media capture),
so plain `http://<ip>` will not work. Caddy issues certificates from its own
internal CA (`tls internal`):

- Quick path: open the site, accept the browser warning once per device.
- Clean path: install Caddy's root cert on your devices. Export it with
  `./deploy/prod.sh cp web:/data/caddy/pki/authorities/local/root.crt .`
  and import it as a trusted CA (then restart the browser).

The CA and issued certs persist in the `caddy_data` volume.

## Backups (rolling) & disaster recovery

The relay writes a gzipped-tar archive of **every vault's ciphertext** (no
keys, no plaintext) into `BACKUP_HOST_DIR` on the host — by default every 24 h,
keeping the newest 14 (`BACKUP_INTERVAL` / `BACKUP_KEEP` in `.env.prod`).

```bash
./deploy/prod.sh exec server /journald backup        # take one now
./deploy/prod.sh exec server /journald list-backups  # what exists
```

The archives are already encrypted (they contain only client-encrypted blobs),
so copying them anywhere is safe. **Do copy them off this machine** — a backup
that lives only on the server it protects is not disaster recovery. A simple
cron on another box works, e.g.:

```
0 5 * * * rsync -a particle@cortex:mneme-backups/ ~/mneme-backups-mirror/
```

Restore (destructive — replaces all relay data; run against a stopped relay):

```bash
./deploy/prod.sh stop server
./deploy/prod.sh run --rm server restore /backups/<archive> --yes
./deploy/prod.sh start server
```

Note what backups do **not** cover, by design: the E2EE model means an archive
is useless without a user's 12-word recovery phrase, and a forgotten phrase is
unrecoverable — from backups too.

## Staying up

Every service has `restart: unless-stopped`, and the Docker daemon is enabled
at boot — the stack comes back by itself after a power cycle or crash. Data
lives in named volumes (`pgdata`, `miniodata`, `caddy_data`) plus the backup
bind mount; `./deploy/prod.sh down` keeps all of it (only `down -v` destroys
volumes — don't).

## Operations crib sheet

```bash
./deploy/prod.sh logs -f server          # relay logs
./deploy/prod.sh logs -f web             # access logs / TLS issuance
./deploy/prod.sh up -d --build           # deploy a new version (rebuilds images)
./deploy/prod.sh restart web             # picked up SITE_ADDRESS changes
docker system prune                       # occasionally, to drop old image layers
```

Admin dashboard: `https://<host>/mneme/admin` with the `ADMIN_TOKEN` from
`.env.prod` (storage footprints, backup controls). Leave `ADMIN_TOKEN` empty
to disable the surface entirely.
