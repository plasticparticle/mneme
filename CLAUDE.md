# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Note:** Sections §1–§12 below are the original **decision document** (in German). They are the
> **source of truth** for architecture and are intentionally not in English (per §11, only this doc is
> German; all code/comments/commits/API are English). This English preamble (§0) is the operating
> guide; if it ever conflicts with §1–§12, §1–§12 win on decisions.

---

## 0. Operating Guide (read first)

### Current state
The directory is named `mneme`; the design doc calls the product "journal" — treat them as the same
project. Scaffolded so far:
- **`apps/client/`** — Vite + Preact + TS app, all four screens built. **Wired to the relay**: real
  BIP39 onboarding → key derivation (`src/crypto/`) → device challenge-response auth + LWW
  encrypted-entry push/pull (`src/sync/`, `src/state/data.tsx`). Identity is in-memory while
  unlocked; at rest the seed is either nowhere (re-enter the mnemonic on cold start — the default)
  or, opt-in ("stay signed in on this device"), **sealed under an Argon2id passphrase or a FIDO2
  security key** (§6 at-rest: `crypto/seedlock.ts` Argon2id→XChaCha20 v:1 records with version byte
  + purpose AAD, or v:2 records wrapped by a WebAuthn **PRF-extension** secret from
  `platform/webauthn.ts` — HKDF'd into the wrap key, not offline-brute-forceable; stored in
  IndexedDB via `platform/keystore.ts`; passphrase/security-key unlock on cold start, 15-min
  inactivity auto-lock + manual "Lock journal", phrase rotation re-seals the new seed under either
  method without a new ceremony, a mnemonic sign-in without a seal choice clears the seal, and
  Preferences → Vault → "Device unlock" (`ui/DeviceUnlock.tsx`, `setDeviceUnlock` in
  `state/data.tsx`) switches passphrase ⇄ security key ⇄ off while unlocked. The key is strictly a
  device-unlock convenience — the mnemonic remains the only account/recovery anchor. Regression
  check: `pnpm --filter client exec tsx scripts/seedlock-methods.ts`). Entries are **durable**: a
  per-owner wa-sqlite DB on OPFS (`src/db/`, forward-only client migrations, currently v6 —
  entries, media, templates, media tombstones, journals, interview types; plaintext by §5a design) is the local source of
  truth, seeded once with sample content and merged with synced entries; dirty-flag outboxes let
  edits, deletes, and media uploads survive offline restarts. The editor is real **TipTap**
  (`src/editor/`: toolbar, `/` slash palette, inline media nodes). Entry bodies are
  XChaCha20-Poly1305 encrypted client-side before push.
- **`server/`** — the Go relay (`journald`): `/healthz` + `/readyz`, embedded forward-only migrations,
  device challenge-response auth (Ed25519), the LWW oplog `sync/push`+`sync/pull`, and CORS. Owner-scoped,
  opaque blobs only. Reminders CRUD + scheduler (logs, no push transport yet). Media is **implemented
  server-relayed** (§12 resolved): `internal/blobs` streams client-encrypted ~1 MiB chunks to S3/MinIO
  (minio-go, bucket auto-provisioned) under `/v1/media/*`; `503` when `S3_ENDPOINT` is unset. Push
  delivery is still a stub. **Operator admin surface** (`/admin`, only when `ADMIN_TOKEN` is set,
  otherwise 404): embedded HTML dashboard + `GET /admin/stats` — per-vault storage footprints
  (truncated pseudonymous owner ids) and owner-less daily counters (`usage_daily`, migration 0002,
  deliberately no owner column; request/record/media/vault metrics buffered in-memory, flushed every
  30 s). It cannot count journals or tell media kinds apart — that data never reaches the relay
  (docs/API.md "Admin", docs/SECURITY.md §2). **Vault deletion** exists on both sides, each behind a
  typed-"delete" confirmation: the operator via `DELETE /admin/vaults/{id}` (confirm string enforced
  server-side; dashboard row button + modal) and the user via the client's "Delete vault" sheet
  (`ui/DeleteVault.tsx`, Preferences → Vault → `deleteVault` in `state/data.tsx`: relay
  `DELETE /v1/account` first, then local OPFS destroy + seal clear, back to onboarding). A user
  session can only ever delete its own vault — `/v1/account` takes no id. **Operator backup + disaster
  recovery** is in (`internal/backup`, `internal/store/backup.go`): a backup is one gzipped-tar archive
  of every vault's opaque ciphertext — the bookkeeping tables as NDJSON + the client-encrypted media
  chunks, no keys, no plaintext (`sessions`/`auth_challenges` deliberately excluded). Restore is a
  single transactional truncate-and-replay (`store.Restore`, realigns `entry_seq`) plus chunk
  re-upload. Configured by `BACKUP_DIR`/`BACKUP_INTERVAL`/`BACKUP_KEEP`; a `Service` owns the directory
  (mutexed run-now, scheduled worker, `.partial`→rename atomic writes, retention prune, strict
  name-regex path guard). Two trigger paths: the admin surface (`/admin/backups` list/status, POST
  to back up now → 202 detached, download, typed-`{"confirm":"restore"}` restore, delete; dashboard
  section + restore modal) and CLI subcommands (`journald backup [--out]` / `restore <archive> [--yes]`
  / `list-backups`) — the CLI is the recommended DR path (runs against a stopped/fresh server). Tests:
  `internal/backup/backup_test.go` (fakes, no DB) + `e2e/backup_e2e_test.go` (real Postgres round-trip).
  docs/API.md "Backups & disaster recovery", docs/SECURITY.md §6.14.
- **Infra** — `docker-compose.yml` (Postgres + MinIO + server, `backups` volume), `server/Dockerfile`, `.devcontainer/`.

Media (§10 step 5) is in for **video, audio, images, and file attachments**: video/audio record via
`getUserMedia`+MediaRecorder in the editor (`ui/VideoCapture.tsx`, `ui/AudioCapture.tsx`, inserted via the `/` slash menu; `addMedia`
in `state/data.tsx`), chunked XChaCha20 encryption under the media key with per-chunk AAD
(`crypto/media.ts`), local plaintext bytes + upload outbox in the wa-sqlite `media` table (schema v2),
background upload + lazy cross-device download (`sync/media.ts`, `state/data.tsx`). Recordings are
**inline TipTap nodes** (`editor/media.tsx`, a block atom whose attrs carry the `MediaAttachment`
metadata inside bodyJson — still inside the encrypted entry body, `sync/engine.ts`); deleting one
requires an explicit confirmation and then purges the local bytes **and the relay copy**
(`removeMedia` → `DELETE /v1/media/{id}`, idempotent; queued in the local `media_tombstones`
table while offline and retried until acknowledged). Images and files picked or dropped into the
editor embed the same way — images group into galleries and maximize into a keyboard-navigable
lightbox (`ui/Lightbox.tsx`) — and surface in previews and search text. Entries from before inline
media render their attachments-array via the legacy `<AttachmentList>` fallback.

**Entry templates** (§10 step 7, private only) are in: predefined seeds + user-created, all
user-editable/deletable. Templates sync as encrypted blobs **through the entry oplog** — the record
kind (`kind: 'template'`) lives inside the ciphertext (`sync/engine.ts`), so the relay cannot tell
templates from entries and **no server changes were needed**. Built-ins (`data/templates.ts`) seed
once per device as pristine, local-only rows (random ids — a well-known id would leak the record
type); the first edit/delete makes one a real synced record, and its `builtin` slug lets other
devices retire their own pristine seed of it (supersede pass in `state/data.tsx` pull). Local store:
`templates` table (schema v3); rotation carries templates (`sync/rotate.ts`). UI: manager sheet
(`ui/Templates.tsx`, sidebar "Templates" / mobile settings) with create/edit/rename/delete/use, the
`/` slash palette has a single **Template** command that opens the same picker and inserts the
chosen template at the cursor, and the new-journal "Start from" picker is wired
to live templates. Wire-path check: `scripts/templates-roundtrip.ts` (relay must be running). The
§5b signed **public** template registry is still not built.

Recovery-phrase **rotation** is in (the "my mnemonic may have leaked" path): `sync/rotate.ts`
re-encrypts the whole vault (entries + media) under a fresh phrase/owner, then `DELETE /v1/account`
wipes the old owner server-side (cascade in Postgres + best-effort S3 chunk cleanup) and the old
per-owner OPFS DB is destroyed locally. UI: "Replace recovery phrase" sheet (`ui/RotatePhrase.tsx`)
from Preferences → Vault. Old account stays intact until the final
wipe; see docs/SECURITY.md §4 and docs/API.md "Account".

Smaller client features in: **vault-wide search** (`ui/Search.tsx` — ⌘/Ctrl+K palette, desktop
sidebar field, mobile nav, journals-screen bar; filters the decrypted in-memory entries by title,
body, labels, and date spellings — FTS5 is still blocked), label autocomplete in the entry header
(`ui/LabelField.tsx`), editable entry date/time (rides inside the encrypted body — re-dating leaks
nothing to the relay), **entry deletion** behind a confirmation (`ui/ConfirmDialog.tsx`; tombstones
through the LWW oplog, purges referenced media locally and on the relay; tombstoned entries stay in
the raw provider list so LWW keeps winning, consumers see a filtered list), **journal deletion**
behind a typed-"delete" sheet (`ui/DeleteJournal.tsx`, desktop journal-card trash / mobile drill-in
header; `deleteJournal` in `state/data.tsx` tombstones every entry in the notebook through the LWW
oplog and purges their media local + relay. Journals themselves now persist in the local `journals`
table — schema v5, seeded once per device, carried across phrase rotation — as a per-device grouping
per §3: they never sync, and a deleted journal keeps its tombstone row so the sample seed can't
resurrect it), a visible
password-manager autofill target on phrase restore, and **math typesetting** (`editor/math.tsx` —
`@tiptap/extension-mathematics` + KaTeX; type `$$x$$` inline / `$$$x$$$` block, or the `/` Math
commands; click a formula to edit it in a live-preview LaTeX dialog. The formula is a `latex` attr
inside bodyJson, so it stays inside the encrypted entry body; `docToText` surfaces the LaTeX source
to previews/search and `DocPreview` renders it in template previews), and a **preferences overlay**
(`ui/Preferences.tsx` — THE settings surface: desktop sidebar identity row / mobile Settings tab;
the old footer icon strip and mobile settings sheet are gone) with light/dark/system
appearance, six theme skins (Paper/Modern/Terminal/Forest/Blossom/Lavender — full `[data-skin]`
surface/type ramps in `tokens.css`, each light+dark) × six orthogonal accent tints (picking a skin
adopts its default accent; `hooks/useTheme.ts`; all device-local localStorage, never synced — the
old boolean dark key migrates), writing stats computed locally over the decrypted entries
(`state/stats.ts`: totals, streaks, days journaled), the assistant rows (AI settings; Templates and
Ask-my-journal on mobile, where the sidebar isn't there to host them), and the vault section
(identity card with connection status, lock, phrase rotation, vault deletion — rows hand off to the
existing sheets).

**Lab/learning-notebook capabilities** (a positioning widening, not a pivot): **tables**
(`@tiptap/extension-table` TableKit, resizable; `/` Table command; row/column controls lead the
toolbar strip while the cursor is inside a table — the template editor (`ui/Templates.tsx`) carries
the same toolbar plus a block-and-math-only `/` palette), **code-block syntax highlighting**
(`@tiptap/extension-code-block-lowlight`, lowlight `common` grammars with auto-detect; warm-paper
token theme + dark variant in `editor.css`), and **cross-entry links with backlinks**
(`editor/wikilink.ts`: an inline `entryLink` atom node carrying `{entryId, label}` inside bodyJson —
entry ids are random, so nothing new leaks to the relay; typing `[[` (or the `/` "Link to entry"
command, which just inserts `[[`) opens an entry picker reusing the SlashMenu machinery; node views
re-resolve live titles so renames heal on next open, and deleted targets render as muted dead chips;
a "Linked from" section under the entry lists referencing entries via `docEntryLinks`). All three
node types are registered unconditionally in `buildExtensions` (docs containing them must open
everywhere) and `DocPreview` renders them. Built-in template seeds gained "Experiment log" (results
table) and "Study notes" — fresh vaults only, since builtin seeding is all-or-nothing. Regression
check: `pnpm --filter client exec tsx scripts/labbook-repro.ts` (jsdom, no relay needed).
Deliberately NOT built: compliance-grade ELN features — signed immutable records fight LWW + E2EE.

**Location / travel maps** (§10 feature-completion): an entry can embed a **single pinned place or a
from→to journey** with a **frozen map** and an optional **travel photo**. A new block-atom node
`locationMap` (`editor/location.tsx`) holds `{from, to, zoom, map, photo}` inside bodyJson exactly
like the media nodes — coordinates/labels stay in the encrypted body; the relay only ever sees random
media ids. The map is rendered **once** at insert time: `location/staticmap.ts` composites
OpenStreetMap raster tiles onto a canvas (`crossOrigin='anonymous'` keeps it un-tainted), draws
pin(s) + a route line, and the result is stored as a normal `kind:'image'` media row — so opening the
entry later (or on another device) decrypts that image and makes **no further third-party requests**.
Endpoints come from address search (`location/geocode.ts` → OSM Nominatim, the one per-insert leak),
browser geolocation, or raw `lat,lng` (the latter two leak nothing). Composer dialog
`ui/LocationPicker.tsx` (`/` "Location" command), with privacy copy mirroring the AI cloud card.
`docMediaIds` counts the snapshot + photo so entry/journal deletion purges them local + relay;
`docToText`/`DocPreview` surface the place names. The node is registered conditionally (needs media
handlers, reused from `state/data.tsx`). Regression check:
`pnpm --filter client exec tsx scripts/location-repro.ts` (jsdom: projection math + node + doc
helpers; the canvas/tile compositor is verified manually). See docs/SECURITY.md §2 "Location
snapshots". Deliberately NOT built: live/pan-zoom maps, road-routed directions (the line is
straight), offline self-hosted tiles.

**Opt-in AI assistant** (client-only; off by default; docs/SECURITY.md §2 "opt-in AI assistant"):
`src/ai/` holds a two-backend provider abstraction — Anthropic (BYO API key, direct browser→API
calls via the dangerous-direct-browser-access CORS header) and Ollama (fully local) — behind one
`AiProvider` interface (`ai/types.ts`; an OpenAI-compatible backend is one new file). **Zero relay
involvement**: requests go browser→provider; journal plaintext must NEVER be proxied through the
relay. Two surfaces: **"Ask my journal"** (`ui/AskJournal.tsx`, sidebar row / Preferences on mobile,
only when enabled) — Q&A over the decrypted in-memory entries, context built by `ai/context.ts`
(search-ranked via the extracted `src/search/core.ts` + recency, per-backend char budgets),
streaming, transcript memory-only; and **editor writing help** (`/` slash commands Continue/
Summarize/Suggest-title → `ui/AiActionDialog.tsx`, current entry only, confirm-before-insert;
gated at editor mount). Settings (`ui/AiSettings.tsx`, Preferences → Assistant) carry the
per-backend privacy copy — the cloud card states that context entries leave E2EE for that request.
The API key is sealed at rest: `Identity.aiKey` (HKDF info="ai-settings", `crypto/keys.ts`) wraps
the settings JSON via `crypto/aead.ts` (version byte + AAD `mneme:ai-settings:v1`, `ai/settings.ts`)
into the IndexedDB keystore slot `'ai-settings'`; lifecycle in `state/data.tsx` (load on unlock,
drop on lock, re-seal under the new seed on phrase rotation, cleared on vault deletion; a different
vault's record fails the AEAD tag → unconfigured). Wire-path check:
`pnpm --filter client exec tsx scripts/ai-roundtrip.ts` (Ollama chat step skips when not running).

**Guided interview + AI entry writing** (extends the opt-in assistant; off unless AI is enabled) is
in: the AI now *writes* entries, not just reads them. **"Daily interview"** (`ui/GuidedInterview.tsx`,
desktop sidebar row / mobile Preferences, gated on `aiSettings.enabled` like Ask-my-journal) runs a
short Q&A — the model asks one question at a time, then **synthesizes a draft entry the user reviews
before saving** (no agentic tool-calling; the text-streaming `AiProvider.chat` is unchanged). A
**Freeform draft** option in the same sheet turns a one-line brief into an entry through the same
review→save path. Saved entries are tagged with the interview type's **name as a label**, and
starting an interview feeds the model the recent same-label entries (`ai/interview.ts`
`buildInterviewHistory`) so repeated runs stay continuous ("history-aware"). Synthesis emits simple
Markdown that a new **`editor/doc.ts markdownToDoc`** (headings/lists/quotes/paragraphs, plain-text
runs) turns into a real entry doc; prompts live in `ai/prompts.ts`. **Interview types** are built-in
**and** user-created, and sync exactly like templates — a new encrypted record kind (`kind:
'interviewType'` inside the ciphertext, `sync/engine.ts`) so **no server changes**: same once-per-
device pristine/builtin seeding (`data/interviews.ts`), supersede-on-sync, dirty-flag outbox, local
`interview_types` table (schema **v6**), and phrase-rotation carry alongside templates. Manager sheet
`ui/InterviewTypes.tsx` (Preferences → Assistant, or "Manage interview types" inside the picker).
Wire-path check: `pnpm --filter client exec tsx scripts/interview-types-roundtrip.ts` (relay running).

**Day One import** (§10 step 7, the first import path) is in: Preferences → Vault → "Import from
Day One" (`ui/ImportDayOne.tsx`) takes a Day One **JSON export .zip** and rebuilds it locally as
encrypted entries. `src/import/` does the work — `dayone.ts` unzips (fflate) and resolves each
entry's media moments to bytes, `markdown.ts` is a scoped Markdown→ProseMirror converter (headings,
marks, lists/tasks, quotes, fenced code, `dayone-moment://` media refs → placeholder nodes),
`run.ts` orchestrates: Day One journals become Mneme notebooks (matched by name, else created),
each entry is created then media is encrypted+attached via the normal `addMedia` path (consecutive
images group into a gallery) and the original `creationDate`/tags are written back. **No special
relay path** — imported records encrypt and sync exactly like hand-authored ones; the zip never
leaves the device. Checks: `pnpm --filter client exec tsx scripts/dayone-import.ts` (parse + doc
conversion, mocked surface) and `scripts/dayone-import-persist.ts` (a 101-entry bulk import driven
through real wa-sqlite under the worker's serialized dispatch — guards the `src/db/worker.ts`
request queue: an unserialized worker interleaves the import's fire-and-forget `putLocal` runs with
`flush`'s `markSynced` BEGIN/COMMIT batches on the single connection and corrupts/loses rows).

Not yet: FTS5 (blocked on a custom wa-sqlite wasm build), push transport + reminders UI (step 6),
export + non-Day-One import (step 7), Tauri shells (step 8) and their OS-keychain at-rest storage (§6).

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
3. **All crypto lives in the frontend** (@noble/@scure — see §3; was libsodium-wasm), once, for every
   client — because the PWA has no Rust shell. Client and server share **only** the wire-format, never
   crypto. (§3, §4)
4. **Every ciphertext is version-prefixed from day one:** `[version:1B][nonce:24B][ct+tag]`,
   XChaCha20-Poly1305 with a random 24-byte nonce. Never AES-GCM. (§3, §6, §11)
5. **Isolated tenants only** — no shared entries, no multi-recipient key wrapping; per-entry
   Last-Write-Wins, no CRDT. (§3)

### Architecture in three layers
- **`apps/client/`** — Vite + Preact + TS. The single web codebase for both the PWA *and* the content
  inside every Tauri shell. Holds crypto (`src/crypto/`), the sync client (`src/sync/`), the local
  wa-sqlite OPFS DB that **is** the source of truth (`src/db/`; FTS5 still pending a custom wasm
  build), the TipTap editor (`src/editor/`), and the dirty-flag offline outbox — all built. (§4, §5a)
- **`apps/desktop/src-tauri/`** — Tauri 2 shell (Rust) for desktop *and* mobile. Rust only here:
  shell + native plugins (notifications, OS keychain, biometrics). Builds **locally only** — not in
  Codespaces (no display; iOS needs macOS/Xcode). (§3, §9)
- **`server/`** — Go relay. HTTP handlers, device challenge-response auth, LWW oplog push/pull, S3
  (MinIO) blob coordination, reminder scheduler + push. Postgres stores only opaque blobs + metadata,
  every handler strictly scoped to `owner_id`. (§4, §5b)

### Commands
```bash
# Infra + Go server
docker compose up -d                 # postgres + minio + server (:8080)
docker compose --profile fullstack up   # also runs the client dev server in compose

# Client dev — pnpm workspace
pnpm install
pnpm --filter client dev --host      # PWA on :5173 (relay on :8080; override VITE_RELAY_URL)
pnpm --filter client typecheck       # strict tsc
pnpm --filter client build           # typecheck + production build

# Go server (in ./server)
go build -o journald ./cmd/journald
gofmt -l . && go vet ./... && go test ./...
TEST_DATABASE_URL=postgres://journal:journal_dev@localhost:5432/journal?sslmode=disable \
  go test -tags e2e ./e2e/...        # full handshake + backup round-trip against a live Postgres

# Operator backup / disaster recovery (same env as the server: DATABASE_URL, S3_*, BACKUP_*)
./journald backup [--out PATH]       # write one archive (BACKUP_DIR or an explicit path)
./journald restore <archive> [--yes] # REPLACE all relay data from an archive (destructive)
./journald list-backups              # list archives in BACKUP_DIR

# Live client↔relay crypto round-trip (relay must be running)
pnpm --filter client exec tsx apps/client/scripts/integration.ts

# Tauri shells (after §10 step 8) — LOCAL ONLY, never Codespaces (not scaffolded yet)
```
Codespaces (`.devcontainer/`) covers the **server + PWA** end-to-end; Tauri is out of scope there.

### Deeper docs
Plain-English deep-dives live in [`docs/`](docs/): `ARCHITECTURE.md` (diagrams), `SECURITY.md`
(E2EE model + attack vectors), `API.md` (relay endpoints), `CONTRIBUTING.md`. This §0 stays the
quick operating guide; `docs/` expands on it; §1–§12 below remain the binding decisions.

### Lint / format (per §11)
TS: strict mode (eslint + prettier). Go: `gofmt` / `golangci-lint`. Rust: `clippy`.

### Sequencing
Follow §10's build order strictly: scaffold+infra → client plaintext (validate UX) → crypto →
sync → media → reminders/push → feature completion → Tauri shells. **Do not add crypto or sync
before the plaintext client UX is validated.**

### Hard guardrails (will silently break security/privacy if violated)
- Entry IDs are **random, never date/timestamp-encoded** — the relay sees `entry_id` in cleartext, so a
  ULID/timestamp id would leak the writing chronology. Implemented as random 128-bit hex in
  `src/sync/ids.ts`. (This is the leak-guard of §3 winning over the "ULID" wording in §5a/§11.)
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
| Krypto-Ort | **Krypto im Frontend**, einmal, für alle Clients | PWA hat keine Rust-Shell → Krypto kann nicht primär in Rust/Go leben |
| Krypto-Library | **@noble/@scure** (`@scure/bip39`, `@noble/curves`, `@noble/ciphers`, `@noble/hashes`) — **überschreibt** das frühere „libsodium-wasm" (User-Entscheidung 2026-06-09) | Audited, synchron (kein wasm-Init), tree-shakeable. Primitive aus §6 unverändert (BIP39→HKDF-SHA256→XChaCha20-Poly1305, X25519/Ed25519) |
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

### Key-Ableitung (alles client-seitig; Implementierung: @noble/@scure, siehe §3)
> Implementiert in `apps/client/src/crypto/` (`mnemonic`, `keys`, `aead`). `owner_id` = base64url(sha256(ownerPub)),
> identisch zur Relay-Ableitung. Device-Key wird aus dem Seed abgeleitet (info="device") → nichts wird persistiert.
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
