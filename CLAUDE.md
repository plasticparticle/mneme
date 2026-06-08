# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Note:** Sections §1–§12 below are the original **decision document** (in German). They are the
> **source of truth** for architecture and are intentionally not in English (per §11, only this doc is
> German; all code/comments/commits/API are English). This English preamble (§0) is the operating
> guide; if it ever conflicts with §1–§12, §1–§12 win on decisions.

---

## 0. Operating Guide (read first)

### Current state
**Scaffolding the client.** The directory is named `mneme`; the design doc calls the product "journal" —
treat them as the same project. The Go server / Postgres / MinIO / Tauri shells are **not** scaffolded yet
(later §10 steps).

### Frontend design source
The product visual design is a **handoff bundle from Claude Design** (claude.ai/design), available at:
`https://api.anthropic.com/v1/design/h/hrDFaHkF8O7MK0ag7u8I5A?open_file=Mneme.html`
(gzip tarball — `WebFetch` it, then `tar xzf`). Primary file: **`Mneme.html`**. It is a React-UMD +
Babel prototype of four screens — **Onboarding** (mnemonic login/restore/unlock), **Journals**
(library + new-journal sheet), **Calendar** (month grid + day list + heatmap), **Editor** (zen writing
surface) — plus a shared design system. The bundle's `frames/` (iOS bezel, browser window, tweaks panel)
and the "Design review" top-bar/stage are **prototype harness only — do not reproduce them**; build a
real responsive shell instead. The design system is implemented in `apps/client/src/`:
- **Warm-paper palette** (cream/ink/sepia + terracotta accent), dark mode via `[data-theme="dark"]`.
- **Type:** Hanken Grotesk (UI) · Newsreader serif (editor/headings) · Spline Sans Mono (mnemonic/metadata).
- Design tokens live in `src/styles/tokens.css` (`:root` CSS variables); port new design values there.
- The prototype models **multiple notebooks inside one mnemonic account** — this is a UI convenience;
  it does **not** override the §3 "isolated tenants" crypto decision (journals are just a local grouping).

### What this is (one line)
Open-source, local-first, **end-to-end-encrypted** journal (a Day One replacement). The server is a
**dumb encrypted-blob relay** — it never sees plaintext, keys, or the mnemonic. See §1 (threat model)
and §7 (why the server is trivial).

### The five things that constrain almost every decision
1. **Server is outside the trust boundary.** No server-side crypto except TLS + opaque blob storage.
   Admin cannot read and cannot recover. (§1, §3 Non-Goals)
2. **The 12-word BIP39 mnemonic *is* the account.** No login, no email, no password. `owner_id` is
   derived from the seed. Forgotten mnemonic = data permanently lost, by design. (§3, §6)
3. **All crypto lives in the frontend** (libsodium-wasm), once, for every client — because the PWA has
   no Rust shell. Client and server share **only** the wire-format (`packages/proto`), never crypto. (§3, §4)
4. **Every ciphertext is version-prefixed from day one:** `[version:1B][nonce:24B][ct+tag]`,
   XChaCha20-Poly1305 with a random 24-byte nonce. Never AES-GCM. (§3, §6, §11)
5. **Isolated tenants only** — no shared entries, no multi-recipient key wrapping; per-entry
   Last-Write-Wins, no CRDT. (§3)

### Architecture in three layers
- **`apps/client/`** — Vite + Preact + TS. The single web codebase for both the PWA *and* the content
  inside every Tauri shell. Holds crypto, the local wa-sqlite (OPFS + FTS5) DB which is the
  **source of truth**, the TipTap editor, and the offline sync outbox. (§4, §5a)
- **`apps/desktop/src-tauri/`** — Tauri 2 shell (Rust) for desktop *and* mobile. Rust only here:
  shell + native plugins (notifications, OS keychain, biometrics). Builds **locally only** — not in
  Codespaces (no display; iOS needs macOS/Xcode). (§3, §9)
- **`server/`** — Go relay. HTTP handlers, device challenge-response auth, LWW oplog push/pull, S3
  (MinIO) blob coordination, reminder scheduler + push. Postgres stores only opaque blobs + metadata,
  every handler strictly scoped to `owner_id`. (§4, §5b)

### Commands (available only after the matching build step)
```bash
# Infra + Go server (after §10 step 1)
docker compose up -d                 # postgres + minio + server
docker compose --profile fullstack up   # also runs the client dev server in compose

# Client dev (after §10 step 2) — pnpm workspace
pnpm install
pnpm --filter client dev --host      # PWA on :5173 (server on :8080)

# Go server (in ./server)
go build -o journald ./cmd/journald
go test ./...                        # single package: go test ./internal/sync/...

# Tauri shells (after §10 step 8) — LOCAL ONLY, never Codespaces
# (commands TBD when apps/desktop is scaffolded)
```
Codespaces (`.devcontainer/`) covers the **server + PWA** end-to-end; Tauri is out of scope there.

### Lint / format (per §11)
TS: strict mode (eslint + prettier). Go: `gofmt` / `golangci-lint`. Rust: `clippy`.

### Sequencing
Follow §10's build order strictly: scaffold+infra → client plaintext (validate UX) → crypto →
sync → media → reminders/push → feature completion → Tauri shells. **Do not add crypto or sync
before the plaintext client UX is validated.**

### Hard guardrails (will silently break security/privacy if violated)
- IDs are **ULID, never date-encoded** — date-encoded IDs leak the writing chronology. (§3, §11)
- **Never** put the entry date in cleartext IDs; never log/DOM the key; auto-lock on inactivity. (§3, §6)
- Every new ciphertext persistence path **must** include the version byte. (§3, §11)
- Reminders fire generic ("Erinnerung") — `fire_at` is a *consciously accepted* cleartext leak; the
  client decrypts content locally. Don't try to "fix" accepted leaks in §3. (§3)
- Migrations are versioned and **forward-only**. (§11)

---

# Journal (Day One Replacement) — Decision Document

> Briefing für Claude Code. Dieses Dokument ist die **Entscheidungs-Quelle der Wahrheit**.
> Architektur-Entscheidungen unter „Locked Decisions" sind getroffen — **nicht neu aufrollen**,
> nur umsetzen. Wo etwas offen ist, ist es als `OPEN:` markiert.

---

## 1. Was wir bauen

Ein **Open-Source, lokal-first, Ende-zu-Ende-verschlüsseltes Journal** als Day-One-Ersatz.
Selbst-hostbar (Homelab). Eine Familie nutzt es mit **getrennten Accounts** — jeder Account ist
ein **isolierter Mandant** (eigenes Tagebuch, kein geteilter Inhalt).

**Threat-Model (zentral, bestimmt alles):** Der Server-Betreiber (Admin) ist **außerhalb** der
Vertrauensgrenze. Der Server sieht **niemals** Klartext, Schlüssel oder Mnemonic — nur opake
Chiffrat-Blobs. Admin **kann nicht lesen und kann nicht wiederherstellen**. Das ist eine bewusste
Wahl mit einer scharfen Konsequenz: **vergessenes Mnemonic = Daten endgültig verloren**. Es gibt
per Design keinen Admin-Recovery-Pfad. Der einzige Recovery-Anker ist das 12-Wort-Mnemonic beim User.

---

## 2. Requirements

**Muss:**
- Flüssig auf Mobile **und** Desktop; Desktop als eigener Client.
- PWA (für Dev-Speed + Browser-Zugang).
- Offline-first.
- E2EE.
- Skaliert auf mehrere hundert User (→ Server-Last ist trivial, siehe §7).
- Rich Text + Video + Audio.
- Labelling, Volltext-Suche, Kalender, Reminder, Push Notifications.
- Export/Import.
- Metadaten pro Eintrag.
- Öffentliche **und** private Eintrags-Templates.

**Kann:** Tabellen, Listen, Checklisten, Bilder im Text.

**Charakter:** Zen-Schreibmodus + schnelle Erfassung stehen im Vordergrund. **Kein** aufwändiges Layout.

---

## 3. Locked Decisions (nicht neu aufrollen)

| Bereich | Entscheidung | Grund (Kurz) |
|---|---|---|
| Client-Codebase | **Vite + Preact + TypeScript**, eine Web-Codebase für alle Shells | Etablierter Stack, ein Editor/UI-Modell für PWA + alle Tauri-Shells |
| Editor | **TipTap (ProseMirror)** | Tabellen/Listen/Checklisten/Inline-Media nativ; reiferes Fundament als Lexical |
| Lokale DB | **wa-sqlite mit `OPFSCoopSyncVFS`** + **FTS5** | Vermeidet COOP/COEP-Header (Stand der Kunst 2026 für embedded media); FTS5 trägt die Suche |
| Desktop + Mobile | **Tauri 2** (v2.10.x) als Shell um dieselbe Web-Codebase | iOS-PWA trägt Offline-first/Push/Reminder **nicht** (Storage-Eviction nach Inaktivität, Push nur installiert). Tauri = persistenter Container + native Notifications + OS-Keychain |
| PWA | Browser-Zugang + Dev-Vehikel — **nicht** der ernsthafte Mobile-Client | s.o. |
| Backend | **Go** (Relay) | I/O-bound, hoch-nebenläufig (Goroutines), statisches Binary, Homelab-Deploy. Keine Server-Krypto → Rust-Vorteile zahlen sich nicht aus |
| Rust | **Nur** in den Tauri-Shells | Dort zwingend, sonst nirgends |
| Krypto-Ort | **libsodium-wasm im Frontend**, einmal, für alle Clients | PWA hat keine Rust-Shell → Krypto kann nicht primär in Rust/Go leben |
| Server-DB | **PostgreSQL** (nur Bookkeeping: owners, device-pubkeys, blob-index, reminder-times, push-subs) | Speichert nur Opakes + Metadaten |
| Media-Store | **S3-kompatibel, self-host** (MinIO/Garage), client-seitig **chunked** verschlüsselt | Chunking ermöglicht Range-Requests auf Chiffrat |
| AEAD | **XChaCha20-Poly1305**, **random 24-Byte Nonce** | 192-Bit-Nonce → Random-Reuse vernachlässigbar (Grund gegen AES-GCM) |
| Ciphertext-Format | **Versions-Byte-Präfix ab Tag 1**: `[version:1B][nonce:24B][ct+tag]` | Ohne das später keine saubere Primitiv-Rotation |
| Recovery / Key-Backbone | **BIP39 12-Wort-Mnemonic** → Seed → Keys. Kein Login, keine E-Mail | Operationalisiert „Admin kann nicht recovern": das Mnemonic IST der einzige Recovery-Anker |
| Sync-Modell | **Per-Entry Last-Write-Wins + Offline-Queue** — **kein CRDT** | Single-User/isolierte Mandanten: concurrent edits desselben alten Eintrags selten. CRDT spart man sich → keine Tombstone-Komplexität |
| Tenancy | **Isolierte Mandanten only** — kein geteilter Inhalt, **kein** Multi-Recipient-Key-Wrapping | Sharing wäre eine separate, deutlich härtere Krypto (Revocation etc.) |

### Explizite Non-Goals / Guards
- **Keine Server-Krypto** außer TLS + opake Blob-Speicherung. Server entschlüsselt nie.
- **Kein CRDT** einbauen (erst wenn concurrent multi-device edit desselben Eintrags real weh tut).
- **Kein AES-GCM** (Nonce-Disziplin); XChaCha20-Poly1305 mit Random-Nonce.
- **Keine geteilten Einträge** / kein Multi-Recipient-Envelope.
- **Eintragsdatum NICHT in cleartext-IDs kodieren** — sonst leakt die Schreib-Chronologie.

### Akzeptierte Leaks (bewusst, nicht „lösen")
Der Server sieht **Metadaten**: Anzahl Einträge (≈ Frequenz), Blob-Größen, Edit-Häufigkeit,
**Reminder-Zeitpunkte** (cleartext, da der Scheduler sie braucht). E2EE schützt **Inhalt**, nicht
**Form**. Reminder feuern generisch („Erinnerung") — Inhalt entschlüsselt der Client lokal.

---

## 4. Repo-Struktur (Monorepo, pnpm + Go module)

```
journal/
├── CLAUDE.md                 # dieses Dokument
├── README.md
├── docker-compose.yml        # infra + server (siehe §8)
├── .devcontainer/
│   └── devcontainer.json     # Codespaces (siehe §9)
├── pnpm-workspace.yaml
├── apps/
│   ├── client/               # Vite + Preact + TS — DIE Web-Codebase (PWA + Tauri-Inhalt)
│   │   ├── src/
│   │   │   ├── crypto/       # libsodium-wasm: mnemonic, seed→keys, aead, chunked-media
│   │   │   ├── db/           # wa-sqlite OPFS, schema, migrations, FTS5, queries
│   │   │   ├── sync/         # offline outbox, LWW oplog client, device-auth
│   │   │   ├── editor/       # TipTap config (tables/lists/checklists/inline-media)
│   │   │   ├── ui/           # zen-capture, timeline, calendar, labels, templates
│   │   │   ├── platform/     # shell-abstraktion: key-storage, notifications
│   │   │   │   ├── pwa.ts     # WebCrypto/passphrase, web-push (VAPID)
│   │   │   │   └── tauri.ts   # OS-keychain (Stronghold), native notifications
│   │   │   └── main.tsx
│   │   ├── public/manifest.webmanifest
│   │   └── vite.config.ts    # + PWA/Workbox plugin
│   └── desktop/              # Tauri 2 Shell — Desktop UND Mobile-Targets
│       └── src-tauri/        # Rust: nur shell, plugins (notification, keychain, biometric)
├── server/                   # Go relay
│   ├── cmd/journald/main.go
│   ├── internal/
│   │   ├── api/              # HTTP handlers
│   │   ├── auth/             # device challenge-response (pubkey-based)
│   │   ├── sync/             # LWW oplog push/pull, blob relay
│   │   ├── blobs/            # S3 coordination (presigned/relayed)
│   │   ├── reminders/        # scheduler + push dispatch (VAPID + APNs/FCM via Tauri)
│   │   └── store/            # Postgres (sqlc oder pgx)
│   ├── migrations/           # goose/atlas SQL
│   ├── Dockerfile
│   └── go.mod
└── packages/
    └── proto/                # wire-format (protobuf) — sprachneutral, client+server teilen sich nur DAS
```

**Sharing-Hinweis:** Client und Server teilen **nur** das Wire-Format (`packages/proto`), nicht
Krypto (die lebt im wasm-Frontend). Das ist der Grund, warum Polyglott (Go-Server + Rust-Shell)
hier kein Makel ist — der wertvolle gemeinsame Teil ist sprachneutral.

---

## 5. Datenmodell

### 5a. Client-SQLite (die *echte*, entschlüsselte DB — lokal, Source of Truth)
```sql
-- alles im Klartext, weil nur auf dem entsperrten Gerät
CREATE TABLE entries (
  id          TEXT PRIMARY KEY,      -- ULID, NICHT datum-kodiert
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  title       TEXT,
  body_json   TEXT NOT NULL,         -- TipTap/ProseMirror JSON
  lww_clock   INTEGER NOT NULL,      -- für LWW (hybrid logical clock empfohlen)
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE VIRTUAL TABLE entries_fts USING fts5(title, body_text, content='');
CREATE TABLE labels (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT);
CREATE TABLE entry_labels (entry_id TEXT, label_id TEXT, PRIMARY KEY(entry_id,label_id));
CREATE TABLE entry_meta (entry_id TEXT, key TEXT, value TEXT, PRIMARY KEY(entry_id,key));
CREATE TABLE media (
  id TEXT PRIMARY KEY, entry_id TEXT, mime TEXT, bytes INTEGER,
  sha256 TEXT, local_blob BLOB, remote_key TEXT, synced INTEGER DEFAULT 0
);
CREATE TABLE reminders (id TEXT PRIMARY KEY, entry_id TEXT, fire_at INTEGER, dispatched INTEGER DEFAULT 0);
CREATE TABLE templates (id TEXT PRIMARY KEY, name TEXT, body_json TEXT, scope TEXT); -- 'private'|'public'
CREATE TABLE oplog_outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, entry_id TEXT, payload BLOB, created_at INTEGER);
CREATE TABLE sync_state (k TEXT PRIMARY KEY, v TEXT);
```

### 5b. Server-Postgres (nur Bookkeeping — **alles opak oder reine Metadaten**)
```sql
-- owner-identität = public key abgeleitet aus dem mnemonic-seed; KEIN passwort, KEINE email
CREATE TABLE owners (
  owner_id    TEXT PRIMARY KEY,      -- = hash(owner_pubkey), aus seed abgeleitet
  owner_pubkey BYTEA NOT NULL,       -- X25519, für sealed-box device-pairing
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE devices (
  device_id   TEXT PRIMARY KEY,
  owner_id    TEXT REFERENCES owners(owner_id),
  device_pubkey BYTEA NOT NULL,      -- für challenge-response auth
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE entry_blobs (             -- der LWW-oplog: opake chiffrat-blobs
  owner_id    TEXT REFERENCES owners(owner_id),
  entry_id    TEXT NOT NULL,
  lww_clock   BIGINT NOT NULL,        -- server vergleicht NUR diese zahl, sieht inhalt nie
  ciphertext  BYTEA NOT NULL,         -- [version][nonce][ct+tag]
  deleted     BOOLEAN DEFAULT false,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (owner_id, entry_id)
);
CREATE TABLE media_blobs (
  owner_id TEXT, media_id TEXT, s3_key TEXT, bytes BIGINT, chunks INT,
  PRIMARY KEY (owner_id, media_id)
);
CREATE TABLE reminders (              -- fire_at ist CLEARTEXT (akzeptierter leak)
  owner_id TEXT, reminder_id TEXT, fire_at TIMESTAMPTZ, dispatched BOOLEAN DEFAULT false,
  PRIMARY KEY (owner_id, reminder_id)
);
CREATE TABLE push_subs (owner_id TEXT, device_id TEXT, kind TEXT, endpoint TEXT, p256dh TEXT, auth TEXT);
CREATE TABLE public_templates (id TEXT PRIMARY KEY, name TEXT, body_json JSONB, author_pubkey BYTEA, sig BYTEA);
```
**Tenant-Isolation:** Jeder Handler scoped strikt auf `owner_id` aus dem authentifizierten Device.
Server erzwingt die Mandanten-Grenze; ein Owner sieht nie Blobs eines anderen.

---

## 6. Krypto-Spezifikation

### Key-Ableitung (alles client-seitig, libsodium-wasm)
```
mnemonic (BIP39, 128-bit entropy, 12 Wörter)
  → seed (BIP39, PBKDF2)
  → root_key (HKDF-SHA256, salt="journal-v1")
      ├─ data_key       (HKDF info="data")      # XChaCha20-Poly1305 für Einträge
      ├─ media_key      (HKDF info="media")      # chunked media
      └─ identity_seed  (HKDF info="identity")   # → X25519 owner-keypair → owner_id = hash(pubkey)
```
- **Eintrag verschlüsseln:** `version_byte || random_nonce(24) || XChaCha20Poly1305(data_key, nonce, body)`.
- **Media:** in ~1 MiB-Chunks, jeder Chunk eigener Nonce; ermöglicht Range-Requests.
- **owner_id** wird aus dem Seed abgeleitet → kein separates Signup, das Mnemonic *ist* der Account.

### Multi-Device-Pairing (der seit Beginn harte Teil — jetzt gelöst)
- **Primär (simpel, wie Evolu):** Mnemonic auf dem Zweitgerät **eintippen**. Kein Transport nötig,
  der Server ist nicht beteiligt. Das Mnemonic ist das portable Secret.
- **Optional (Komfort):** Zweitgerät erzeugt eigenes Keypair, zeigt Pubkey als QR; Erstgerät
  `crypto_box_seal`t den Seed an diesen Pubkey, Transfer via Server-Relay (Server sieht nur sealed blob).

### Key-Storage at-rest — **Korrektur einer früheren Aussage**
Frühere Notiz im Projekt sagte „WebCrypto non-extractable CryptoKey". Das ist mit libsodium **nicht
sauber haltbar**: libsodium braucht die rohen Key-Bytes im wasm-Memory, „non-extractable" (ein
WebCrypto-Konzept) greift dort nicht. Ehrliche Position:
- **In-Memory während entsperrt ist unvermeidbar** für wasm-Krypto. Mitigation: strenge CSP gegen XSS,
  Auto-Lock nach Inaktivität, Key nie in DOM/Logs.
- **PWA at-rest:** Seed entweder gar nicht persistieren (Mnemonic/Passphrase bei Cold-Start neu) **oder**
  Seed mit passphrase-abgeleitetem Key (**Argon2id**, `crypto_pwhash`) verschlüsselt in IndexedDB.
- **Tauri at-rest:** Seed in **OS-Keychain** (Stronghold-Plugin), Entsperren via OS-Biometrie.

### Argon2id-Parameter
`crypto_pwhash` mit `MODERATE` als Default; auf Mobile ggf. `INTERACTIVE` (Cold-Start-Budget).
Salt random pro Owner, daneben gespeichert.

---

## 7. Warum der Server trivial ist
Mehrere hundert User × E2EE = der Server ist ein **dummes Blob-Relay**: kein Indexieren von Inhalt
(geht nicht, ist Chiffrat), kein Rendering, keine schwere Query. LWW = ein Integer-Vergleich pro
Eintrag. Last ist I/O, nicht CPU. „Skaliert auf hunderte User" ist hier de facto kostenlos — ein
einzelnes Go-Binary auf dem Homelab trägt das mühelos.

---

## 8. docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: journal
      POSTGRES_PASSWORD: journal_dev
      POSTGRES_DB: journal
    volumes: [pgdata:/var/lib/postgresql/data]
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U journal"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin_dev
    volumes: [miniodata:/data]
    ports: ["9000:9000", "9001:9001"]
    healthcheck:
      test: ["CMD-SHELL", "mc ready local || exit 1"]   # ggf. auf curl /minio/health/live anpassen
      interval: 5s
      timeout: 5s
      retries: 10

  createbuckets:
    image: minio/mc
    depends_on: { minio: { condition: service_started } }
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin_dev &&
      mc mb -p local/journal-media || true;
      exit 0;"

  server:
    build: { context: ./server }
    environment:
      DATABASE_URL: postgres://journal:journal_dev@postgres:5432/journal?sslmode=disable
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin_dev
      S3_BUCKET: journal-media
      LISTEN_ADDR: ":8080"
    depends_on:
      postgres: { condition: service_healthy }
      minio:    { condition: service_started }
    ports: ["8080:8080"]

  # Optional: Client-Dev-Server in compose (sonst direkt via `pnpm dev`)
  client:
    profiles: ["fullstack"]
    image: node:22
    working_dir: /app
    command: sh -c "corepack enable && pnpm install && pnpm --filter client dev --host"
    volumes: [".:/app"]
    ports: ["5173:5173"]
    depends_on: [server]

volumes:
  pgdata:
  miniodata:
```

**server/Dockerfile** (multi-stage):
```dockerfile
FROM golang:1.23 AS build
WORKDIR /src
COPY server/go.* ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -o /journald ./cmd/journald

FROM gcr.io/distroless/static-debian12
COPY --from=build /journald /journald
EXPOSE 8080
ENTRYPOINT ["/journald"]
```

Hochfahren: `docker compose up -d` (infra + server). Voll inkl. Client: `docker compose --profile fullstack up`.

---

## 9. GitHub Codespaces — `.devcontainer/devcontainer.json`

```json
{
  "name": "journal-dev",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu-24.04",
  "features": {
    "ghcr.io/devcontainers/features/node:1":   { "version": "22" },
    "ghcr.io/devcontainers/features/go:1":     { "version": "1.23" },
    "ghcr.io/devcontainers/features/rust:1":   {},
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "forwardPorts": [5173, 8080, 5432, 9000, 9001],
  "postCreateCommand": "corepack enable && pnpm install && (cd server && go mod download) && docker compose up -d postgres minio createbuckets server",
  "customizations": {
    "vscode": {
      "extensions": ["golang.go", "rust-lang.rust-analyzer", "dbaeumer.vscode-eslint", "esbenp.prettier-vscode"]
    }
  }
}
```

Im Codespace dann: `pnpm --filter client dev --host` → Port 5173 (PWA). Server läuft auf 8080.

### Wichtiger Codespaces-Caveat
**Codespaces deckt Server + Web-Client (PWA) end-to-end ab** — voll entwickelbar und testbar.
Die **Tauri-Shells** (Desktop + Mobile) bauen **NICHT** sinnvoll in Codespaces: kein Display, und
**iOS braucht zwingend macOS/Xcode**. Tauri-Builds passieren **lokal**. Reife-Flag: Tauri-2-Mobile
ist stabil-nutzbar, aber „nicht alle Desktop-Plugins sind auf Mobile portiert" — vor dem
Mobile-Push-Pfad die verfügbaren Notification-Plugins prüfen.

---

## 10. Build-Reihenfolge (für Claude Code zu sequenzieren)

1. **Scaffold + Infra:** Monorepo, compose, devcontainer, Postgres-Migrations, Go-Server-Skelett + `/healthz`.
2. **Client lokal, plaintext:** Vite+Preact+TS, wa-sqlite OPFS + Schema + FTS5, TipTap, Zen-Capture, Timeline. **Noch keine Krypto, kein Sync** — erst UX validieren.
3. **Krypto-Layer:** BIP39-Onboarding, seed→keys, XChaCha20 + Versions-Byte, at-rest-Modell (§6). Weiterhin local-only.
4. **Sync:** LWW-Oplog Outbox (Client) + Go-Relay push/pull, Device-Auth (challenge-response), Encrypted-Blob-Transport.
5. **Media:** chunked encryption + MinIO via server-koordinierten Upload.
6. **Reminder + Push:** Server-Scheduler, Web-Push (VAPID) für PWA + native Notifications in Tauri.
7. **Feature-Komplettierung:** Templates (public signiert-cleartext / private encrypted), Export/Import (verschlüsseltes Archiv + optionaler Plaintext-Export), Kalender/Labels/Metadaten-UI.
8. **Tauri-Shells:** Desktop zuerst, dann Mobile — **lokal** gebaut, nicht in Codespaces.

---

## 11. Konventionen
- **Sprache:** Code, Kommentare, Variablen, Commits, API → **Englisch**. (Dieses Dokument bewusst Deutsch.)
- **TS:** strict mode. **Go:** `gofmt`/`golangci-lint`. **Rust:** `clippy`.
- **IDs:** ULID, nie datum-kodiert (Leak-Guard).
- **Migrations:** versioniert, forward-only.
- **Secrets:** nie committen; compose nutzt `_dev`-Defaults nur für lokal.
- Bei jeder neuen Chiffrat-Persistenz: **Versions-Byte nicht vergessen.**

## 12. OPEN (echte offene Punkte)
- `OPEN:` Hybrid Logical Clock vs. simpler Lamport-Counter für `lww_clock`.
- `OPEN:` Media-Upload: server-relayed vs. presigned S3-PUT (presigned = weniger Server-Last, aber MinIO-Endpoint muss erreichbar sein).
- `OPEN:` Tauri-Mobile-Push-Plugin-Stand vor Schritt 6 verifizieren.
- `OPEN:` `crypto-pouch`/Attachment-Verschlüsselung irrelevant (kein PouchDB) — gestrichen.
