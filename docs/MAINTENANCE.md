# Maintenance & operations

The unglamorous-but-load-bearing side of running a Mneme relay: backups, restore, upgrades, health
checks, and what to do when something goes sideways. This assumes you've already stood up the
production stack from [DEPLOYMENT.md](./DEPLOYMENT.md); commands use the `./deploy/prod.sh` wrapper.

A reassuring reminder before we start: the relay is a **dumb encrypted-blob courier**. It holds no
keys and no plaintext, so most "maintenance" here is ordinary infrastructure hygiene — copy some
files, watch some logs, prune some images — rather than anything that could actually read a soul.

> **Dev vs prod:** in the dev stack, swap `./deploy/prod.sh` for `docker compose` and the CLI path
> `/journald` still applies (`docker compose exec server /journald …`).

---

## The 30-second health check

```bash
./deploy/prod.sh ps                          # every service Up / healthy?
curl -k https://<host>/mneme/healthz         # {"status":"ok"}  — liveness
curl -k https://<host>/mneme/readyz          # readiness — also pings Postgres
```

If `/healthz` answers but `/readyz` doesn't, the relay is alive but can't reach Postgres — check the
`postgres` container and credentials before anything else.

The **admin dashboard** at `https://<host>/mneme/admin` (with your `ADMIN_TOKEN`) shows per-vault
storage footprints, daily aggregates, runtime stats, and the backup controls. It shows health and
growth, never people — see [API.md](./API.md#admin).

---

## Backups

The relay writes a gzipped-tar archive of **every vault's ciphertext** — bookkeeping tables as NDJSON
plus the client-encrypted media chunks. **No keys, no plaintext** (the relay never had any), so an
archive is exactly as sensitive as the relay's own storage: it neither strengthens nor weakens E2EE.
`sessions` and `auth_challenges` are deliberately excluded so a restore can't resurrect a stale
credential.

In production, backups run **automatically** on `BACKUP_INTERVAL` (default 24 h), keeping the newest
`BACKUP_KEEP` (default 14) in `BACKUP_HOST_DIR`. To take one right now, or see what exists:

```bash
./deploy/prod.sh exec server /journald backup          # write one archive now
./deploy/prod.sh exec server /journald list-backups    # list archives in BACKUP_DIR
```

You can also trigger and download backups from the admin dashboard, or via the API
(`POST /admin/backups`, `GET /admin/backups`, `GET /admin/backups/{name}`).

### Copy them off the box (this is the actual disaster recovery)

A backup that lives only on the server it protects is not a backup; it's a slightly smug copy waiting
to die alongside the original. **Copy archives to another machine.** They're already encrypted (only
client-encrypted blobs inside), so moving them around is safe. A cron on another host does the job:

```bash
0 5 * * * rsync -a user@mneme-host:/home/user/mneme-backups/ ~/mneme-backups-mirror/
```

> **Belt and braces:** although archives contain no plaintext, they *do* concentrate all vaults' data
> and the accepted metadata into one portable file. Restrict the directory (`0700` / files `0600`),
> and if you're shipping them somewhere less trusted, wrap them with `age` or `gpg` first.

---

## Restore (disaster recovery)

Restore is **destructive**: it replaces *all* relay data with the archive's contents (a transactional
truncate-and-replay; a failure leaves existing data untouched), then re-uploads media chunks to object
storage. It clears sessions, so every device re-authenticates on next sync. The **recommended** path
is the CLI, run against a **stopped** relay — which is the usual state when you're recovering anyway:

```bash
./deploy/prod.sh stop server
./deploy/prod.sh run --rm server restore /backups/<archive> --yes
./deploy/prod.sh start server
```

There's also an admin-surface restore (`POST /admin/backups/{name}/restore` with a typed
`{"confirm":"restore"}` body) for restoring on a running server. An archive whose schema version is
newer than the running binary is refused — **upgrade `journald` first**.

And the load-bearing caveat, one more time: a restored archive is still just ciphertext. It brings back
everyone's encrypted blobs; it does **not** bring back anyone's forgotten recovery phrase. There is no
phrase in there to restore.

---

## Upgrades

```bash
git pull                                # get the new code
./deploy/prod.sh up -d --build          # rebuild images + rolling restart
./deploy/prod.sh ps                     # confirm healthy
```

Database migrations are **forward-only** and **embedded in the binary** — they apply automatically on
startup. There's no separate migration step to run and, by design, no "downgrade" button. Roll forward,
not back. If you upgrade across a schema bump and then need to restore an *older* archive, restore
against the matching (older) binary or take a fresh backup first.

---

## Logs & troubleshooting

```bash
./deploy/prod.sh logs -f server         # relay logs (auth, sync, errors)
./deploy/prod.sh logs -f web            # Caddy: access logs + TLS issuance
./deploy/prod.sh logs -f postgres       # database
```

| Symptom | Likely cause & fix |
|---|---|
| Client shows "offline", relay is up | Wrong relay URL, or the browser rejected Caddy's cert. Check the Relay-server row in Preferences and that you accepted/installed the CA (see [DEPLOYMENT.md](./DEPLOYMENT.md#https-on-a-lan-why-and-how-to-stop-the-browser-sulking)). |
| Media uploads stay queued | `S3_ENDPOINT` unset or MinIO down — media endpoints answer `503` and clients retry. Check the `minio` container. |
| `/readyz` failing | Postgres unreachable — check the `postgres` container, volume, and password. |
| New relay endpoint 404s after a deploy | Compose reused a stale image. Force it: `./deploy/prod.sh up -d --build server`. |
| `/admin` returns 404 | Intended when `ADMIN_TOKEN` is empty. Set it in `.env.prod` and redeploy to enable the surface. |
| A client feels haunted after a dependency bump | A long-lived dev Vite server can go stale; restart it against a cold server before chasing ghosts. |

---

## Housekeeping

```bash
docker system prune                     # drop dangling image layers (occasionally)
./deploy/prod.sh exec postgres \
  psql -U mneme -c 'SELECT count(*) FROM entry_blobs;'   # poke the bookkeeping DB directly
```

- **Volumes** (`pgdata`, `miniodata`, `caddy_data`, `caddy_config`) hold everything. `./deploy/prod.sh
  down` keeps them; `down -v` **destroys** them. The distinction is one character and your entire
  dataset — respect it.
- **Rotating dev credentials:** if you ever ran the dev stack with `_dev` defaults and then went to
  prod, make sure `.env.prod` has genuinely new secrets. The `_dev` values are public knowledge (they
  live in `docker-compose.yml`), which is fine for localhost and catastrophic anywhere else.
- **Reclaiming abandoned vaults:** an operator can wipe a vault by id from the admin dashboard (typed
  `"delete"` confirmation) or `DELETE /admin/vaults/{id}`. This frees storage; it cannot read anything
  first.

---

## What maintenance can never do

No amount of operator access lets you read, recover, or reset a user's journal. That isn't a missing
runbook entry — it's the [security model](./SECURITY.md) working exactly as designed. If a user loses
their phrase, the kindest and only true answer is: it's gone. Point them at the big yellow warning box
they were shown at the start, gently.
