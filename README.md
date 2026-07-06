# Mneme

> A private place to remember — an open-source, local-first, **end-to-end-encrypted** journal.
> Your thoughts are encrypted on your device before they go anywhere. Nobody else can read them:
> not the server, not whoever runs the server, not a well-funded company that would dearly love to
> know what you think about. Including, if you lose your recovery phrase, **you**. More on that
> delightful little footgun in a moment — it's important, so we put it in a big yellow box.

Mneme is a calm, paper-coloured notebook for your thoughts. It runs in your browser today (native
desktop and mobile shells are on the way), keeps the real database on your own device, and syncs
through a server so clueless it couldn't spy on you if it tried.

---

## Why this exists

Your journal is the most honest thing you own. It's where the unfiltered version of you lives — the
fears, the half-formed ideas, the things you'd never say out loud. That is *exactly* the data that
multi-billion-euro companies would most like to have, because nothing sharpens an advertising or
behavioural profile like a person's inner monologue.

Mneme is a small act of refusal. The premise is **data autonomy**: your private thoughts should be
yours alone, not raw material for someone else's profit model. So the design starts from a hard
rule — *the server can never read your journal* — and everything else follows from it. No accounts
to harvest, no plaintext on anyone's disk but yours, no telemetry, no "we value your privacy" page
that quietly means the opposite. You can run the whole thing on a Raspberry Pi in your closet and
owe no one an explanation.

The name comes from **Mneme**, the Greek muse of memory (one of the three original Boeotian muses,
if you want to win a pub quiz). Fittingly, she did not offer a password reset either.

---

> [!WARNING]
> ## There is no password reset. There is no admin recovery. Lose the phrase, lose the journal.
>
> Your account **is** a 12-word recovery phrase. There is no email, no password, no "forgot
> password" link — because there is no server-side secret that *could* unlock your data. Your phrase
> derives the only keys that can decrypt your journal, and those keys never leave your device.
>
> **If you lose your 12 words, your journal is gone. Permanently. Cryptographically. Forever.**
> Not "gone, call support." The person running the server *cannot* help you — they hold only
> unreadable encrypted blobs. This is not a bug or an oversight. It is the literal mechanism that
> stops anyone else from reading your diary, working exactly as intended.
>
> **Write the phrase down. On paper. Put it somewhere safe.** A password manager works too. Treat
> it like the key to a safe-deposit box that holds your entire inner life, because that is precisely
> what it is.

---

## What you can do with it

Mneme is a full journaling environment, not a text box. Everything below is **built and working
today** (in the browser app):

### Writing
- **A real rich-text editor** (TipTap/ProseMirror) with a Zen writing surface — serif body text, a
  quiet toolbar, and a `/` slash palette for inserting anything without reaching for the mouse.
- **Rich content**: headings, lists, checklists/tasks, blockquotes, **tables** (resizable), and
  **code blocks with syntax highlighting**.
- **Math typesetting** — write `$$x^2$$` inline or `$$$ ... $$$` for a display block; formulas render
  with KaTeX and open in a live-preview LaTeX editor when you click them.
- **Cross-entry links with backlinks** — type `[[` to link to another entry; each entry shows a
  "Linked from" list of everything that references it, so your journal becomes a little web of
  thought.
- **Editable date & time per entry** — backdate or re-date freely (and since the date rides *inside*
  the encrypted body, re-dating leaks nothing to the server).
- **Labels** with autocomplete, and **multiple notebooks** ("journals") to keep different threads
  apart.

### Media (all end-to-end encrypted, chunked, and synced)
- **Photos and image galleries** — drop images in, they group into galleries and open in a
  keyboard-navigable lightbox.
- **Video and audio recording** straight from the editor (via your camera/microphone).
- **File attachments** of any kind.
- **Location & travel maps** — pin a place or a from→to journey. The map is rendered **once** into a
  frozen image at insert time, so opening the entry later makes *no* further calls to any map
  service.

### Organising & finding
- **Vault-wide search** (⌘/Ctrl+K) across titles, bodies, labels, and dates.
- **A calendar** with month, year, and timeline views plus a writing heatmap.
- **Writing stats** — totals, streaks, and days journaled, all computed locally.
- **Templates** — built-in starters (experiment log, study notes, and more) plus your own, fully
  editable, synced as encrypted blobs.
- **Import** from existing journaling apps, rebuilt locally as encrypted entries (the import file
  never leaves your device).

### Make it yours
- **Six theme skins** (Paper, Modern, Terminal, Forest, Blossom, Lavender), each with a light and
  dark variant, times six accent tints. Light / dark / system, all stored locally and never synced.
- **Responsive** — a three-pane desktop layout above 920px, a mobile shell with bottom navigation
  below it.

### When things change
- **Recovery-phrase rotation** if you ever fear your phrase leaked (explained in detail below).
- **Entry, journal, and whole-vault deletion**, each behind an explicit confirmation, propagated to
  the server and any other device.

---

## The AI assistant (optional, off by default, and private by design)

Mneme has an AI assistant that can both **read** and **write** in your journal:

- **Ask my journal** — ask questions over your own entries and get answers grounded in what you've
  written.
- **Writing help** in the editor — Continue, Summarize, or Suggest-a-title for the entry you're on,
  always with a confirm-before-it-inserts step.
- **Guided interviews** — the assistant asks you one reflective question at a time, then drafts a
  full entry for you to review and save. It even remembers previous entries of the same kind, so a
  recurring "daily reflection" stays continuous. (There's also a one-line "freeform draft" mode.)

Here's the important part. The AI feature is **never** routed through the Mneme server — requests go
straight from your device to the model. You choose the model, and **the recommended choice is a
local or on-premise LLM** — something like **Gemma running under [Ollama](https://ollama.com/)** on
your own machine. With a local model, your most private thoughts are used to help you *and never
leave your computer*. That is the whole spirit of the project.

You **can** instead point it at a cloud model (bring your own Anthropic API key). It's more capable,
and it's there if you want it — but be clear-eyed about the trade: for each request, the entries
used as context are decrypted and sent over HTTPS to that provider. You would be handing your inner
thoughts to exactly the kind of large company this project exists to keep them away from. The choice
is yours; the settings screen states the consequence plainly, and the assistant ships **off by
default**.

(Your API key, if you use one, is itself sealed at rest under a key derived from your recovery
phrase — only openable while your vault is unlocked.)

---

## How the security works (the short version)

The one idea behind everything: **the server is outside your circle of trust.** It is a dumb relay
that stores encrypted blobs and shuffles them between your devices. It never sees plaintext, never
sees your keys, never sees your phrase.

- **End-to-end encryption.** Every entry and every media chunk is encrypted on your device with
  **XChaCha20-Poly1305** before it's sent. The server stores opaque ciphertext and can only compare
  a single integer to resolve which edit is newer.
- **The phrase is the account.** A 12-word BIP39 phrase derives all your keys and your `owner_id`.
  No signup, no email, no password database to breach — there's nothing on the server to steal that
  would help anyone read your journal.
- **Local-first.** The real database lives on *your* device (an encrypted-at-the-boundary, durable
  local store). The cloud is just a courier. Offline? Keep writing — it syncs when it can.
- **Honest about metadata.** E2EE protects *content*, not *shape*. The server can see roughly how
  often and how much you write, and your reminder times — never *what* you wrote. We don't pretend
  otherwise; the full list is in [`docs/SECURITY.md`](./docs/SECURITY.md).
- **At rest.** By default nothing is persisted but your entries (locally) — you re-enter the phrase
  on a cold start. Optionally ("stay signed in on this device"), your seed is sealed under an
  **Argon2id** passphrase, with a 15-minute inactivity auto-lock and a manual "Lock journal"
  control.

The deep, frank version — including the known weaknesses and accepted trade-offs — lives in
[`docs/SECURITY.md`](./docs/SECURITY.md). It does not flatter the project.

### Recovery-phrase rotation, explained properly

If you fear your 12 words may have leaked, you can **replace your recovery phrase** (Preferences →
Vault → "Replace recovery phrase"). This is *not* a password change — a phrase can't be edited in
place, because every key and your very identity are derived from it. Instead, rotation performs a
**full migration**:

1. A brand-new 12-word phrase is generated.
2. Your entire vault — every entry and every media object — is **re-encrypted under the new keys**.
3. It's pushed to the server as a **completely new owner**.
4. Only once everything is safely stored under the new identity is the **old account wiped**
   (`DELETE /v1/account`) and the old local database destroyed.

The old account stays fully intact until that final step, so an interrupted rotation never loses
data, and retrying with the same new phrase is safe. Afterwards, the **leaked phrase unlocks
nothing but an empty vault**.

> [!IMPORTANT]
> Rotation protects you *going forward*. It cannot retract copies an attacker may have already
> copied while the old phrase was valid. And of course: write the **new** phrase down too. The same
> warning as before applies in full.

---

## Quick start (running it on your own machine)

You'll need **Node 20+** and **pnpm 10** (the repo pins it; `corepack` handles it).

```bash
corepack enable      # wake up the package manager (once)
pnpm install         # install dependencies
pnpm dev             # run the app
```

Open **http://localhost:5173** and you're in. "Start a new journal" generates a real 12-word
recovery phrase (write it down!); "I have a recovery phrase" restores from one you already have (a
password manager can save and fill it).

That's enough to write — the app works fully offline against its local database. To sync between
devices, bring up the relay too:

```bash
docker compose up -d            # Postgres + MinIO + the relay, on :8080
curl localhost:8080/healthz     # {"status":"ok"}
```

The client points at `http://localhost:8080` by default (override with `VITE_RELAY_URL`). The vault
indicator switches to "synced · encrypted" once the handshake succeeds; if the relay is down, the
app simply stays local and shows "offline" — your writing is never blocked on the network.

Want to watch the whole crypto + sync round-trip without a browser? With the relay running:

```bash
pnpm --filter client exec tsx scripts/integration.ts   # register → auth → encrypt → push → pull → decrypt
```

---

## Running the server (for operators)

The server is a single Go binary called `journald` — a deliberately clueless relay that stores
opaque encrypted blobs and coordinates encrypted media into S3/MinIO. The `docker-compose.yml` at
the repo root brings up Postgres, MinIO, and the relay together. It's I/O-bound and featherweight;
your homelab will not notice it (several hundred users of an E2EE journal is, server-side, basically
free — there's nothing to index or render).

For the API surface and the relay's own test suite, see
[`server/README.md`](./server/README.md) and [`docs/API.md`](./docs/API.md).

### Production deployment (self-hosted, LAN)

The root `docker-compose.yml` is the **dev** stack (published ports, `_dev` default
secrets, HTTP). For a real self-hosted deployment there's a separate production stack —
`docker-compose.prod.yml` plus the `./deploy/prod.sh` wrapper — that adds Caddy in front
to serve the built client and the relay on **one HTTPS origin**, `restart: unless-stopped`
on every service, and rolling encrypted backups. The full runbook (HTTPS on a LAN, backups,
restore, staying up) lives in **[`deploy/README.md`](./deploy/README.md)**.

**Prerequisites on the host:** Docker Engine + the Compose plugin, enabled at boot, and a
clone of this repo.

```bash
# one-time: Docker (Debian/Ubuntu; see docs.docker.com for other distros)
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # then log out/in so `docker` works without sudo

git clone <this-repo> mneme && cd mneme
```

Then configure secrets and bring the stack up:

```bash
cp .env.prod.example .env.prod    # fill in POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD,
                                  # ADMIN_TOKEN, SITE_ADDRESS, DEFAULT_SNI, BACKUP_HOST_DIR
./deploy/prod.sh up -d --build    # build images + start Postgres, MinIO, relay, Caddy
./deploy/prod.sh ps               # everything Up / healthy?
```

Open `https://<host>/mneme/`. Because the client needs a secure context (OPFS + media
capture), Caddy issues certificates from its own internal CA — accept the browser warning
once per device, or install its root cert (details in the runbook). Deploying a new version
is the same `./deploy/prod.sh up -d --build`; `./deploy/prod.sh down` stops the stack while
keeping all data. **See [`deploy/README.md`](./deploy/README.md) for backups, disaster
recovery, and the full operations crib sheet.**

### The admin dashboard

If you host the relay, there's an **operator dashboard** at **http://localhost:8080/admin** (dev
token: `admin_dev`, set in `docker-compose.yml`).

It is **disabled by default**: every `/admin` route returns a plain `404` until you set the
`ADMIN_TOKEN` environment variable. Set it to a real secret in production — or leave it unset and
the admin surface simply does not exist.

Crucially, the dashboard shows **health and growth, never people**. It is built so that the operator
gains *no* ability to read or even identify anyone's content:

- **Per-vault storage footprints** — how much space each vault uses, keyed by a **truncated,
  pseudonymous** owner id (a hash, not a name or email).
- **Daily aggregate counters** — request, record, media, and vault metrics, stored deliberately
  **without any owner column**, so they can't be tied back to an individual.
- **Vault deletion** — an operator can wipe a vault by id, gated behind a typed `"delete"`
  confirmation. (Users can also delete their own vault from inside the app.)
- **Backups & disaster recovery** — trigger a backup, list and download archives, and restore from
  one (gated behind a typed `"restore"` confirmation, since restore replaces all relay data). A
  backup is one gzipped archive of every vault's **encrypted** blobs and media chunks — **no keys,
  no plaintext**, because the relay never had any. The same operations are available as CLI
  subcommands (`journald backup` / `restore` / `list-backups`), which is the recommended path for a
  real recovery against a stopped server.

What the dashboard fundamentally *cannot* do is tell you what anyone wrote — that data never reaches
the server in readable form. Full details in [`docs/API.md`](./docs/API.md#admin) and
[`server/README.md`](./server/README.md#admin-dashboard), and the security analysis in
[`docs/SECURITY.md`](./docs/SECURITY.md).

---

## Documentation

The README is the friendly tour. The neutral, detailed references live in [`docs/`](./docs) — start
with [`docs/README.md`](./docs/README.md):

| Doc | What's in it |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Components, key derivation, the sync sequence, the data model — with diagrams. |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | The E2EE model, the crypto choices, and a frank list of attack vectors and known weaknesses. |
| [`docs/API.md`](./docs/API.md) | The relay's HTTP API reference, including the admin surface. |
| [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) | Setup, the quality gates, conventions, and where things live. |
| [`server/README.md`](./server/README.md) | Running, configuring, and testing the Go relay specifically. |
| [`deploy/README.md`](./deploy/README.md) | Self-hosted production deployment: the Docker+Caddy prod stack, HTTPS on a LAN, backups, and disaster recovery. |
| [`CLAUDE.md`](./CLAUDE.md) | The decision document and source of truth (German; §0 is an English operating guide). |

---

## Current state

It's pre-1.0 and we're honest about it. The four screens, the Go relay, and the encryption are
built, and the client is genuinely wired to the relay: real BIP39 onboarding, client-side
encryption, encrypted push/pull sync, a durable local database, a real editor, encrypted media, AI
assistant, templates, search, and phrase rotation all work end-to-end today, in the browser.

Still ahead: a full-text search index (blocked on a custom wa-sqlite build), reminders UI + push
notifications, broader export, and the native **Tauri** desktop and mobile shells with OS-keychain
storage. There has been **no external security audit** — treat the guarantees as careful design
intent, not certification, and don't trust it with data you can't afford to lose until it's had
more eyes. The roadmap lives in [`CLAUDE.md`](./CLAUDE.md) §10.

---

## License

Open source. (Specific license to be added — for now, assume "be kind, and don't pretend you wrote
it.")

---

*Mneme — named after the Greek muse of memory, who, fittingly, did not offer a password reset
either.*
