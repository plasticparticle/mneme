# Mneme

> A private place to remember — an open-source, local-first, end-to-end-encrypted journal.
> Think *Day One*, except nobody (not us, not your server admin, not a well-funded adversary
> with a subpoena) gets to read your diary. Including, if you lose your recovery phrase, **you**.
> More on that delightful little footgun below.

Mneme is a calm, paper-coloured notebook for your thoughts. It runs on your phone, your
desktop, and in your browser, syncs through a server that is too clueless to spy on you, and
encrypts everything before it leaves the building.

---

## The pitch (a.k.a. why this exists)

- **End-to-end encrypted.** Your words are scrambled on your device before they go anywhere.
  The server stores opaque blobs and reminder times and *nothing it can actually read*.
- **Local-first.** The real database lives on your device. The cloud is just a courier.
  Offline? Keep writing. The courier will catch up later.
- **No accounts, no passwords, no email.** A 12-word recovery phrase **is** your account.
  This is wonderfully simple and mildly terrifying — see the warning, which we promise to keep
  repeating until you write the words down.
- **Zen writing.** Serif body text, a quiet toolbar, dark "paper" mode. Designed for showing
  up and writing the true thing, not for fiddling with margins.
- **Self-hostable.** It's a single Go binary and some friends in a `docker-compose.yml`.
  Your homelab can run it without breaking a sweat. (The server is *that* lazy. By design.)

> [!WARNING]
> **There is no "Forgot password" button. That's not an oversight — it's the entire point.**
> If you forget your 12-word recovery phrase, your journal is gone. Not "gone, call support."
> Gone-gone. Cryptographically, irreversibly, write-it-on-paper-and-hide-it gone. The server
> admin literally *cannot* help you, no matter how nicely you ask or how much you cry.

---

## Current state: it's early, and we're being honest about it

The full UI for all four screens is built, the Go relay is built, and the client is **actually wired
to it**: real BIP39 onboarding, client-side encryption, encrypted push/pull sync, a durable local
database, a real rich-text editor, and encrypted media all work end-to-end. What you can play with
today:

| Thing | Status |
|---|---|
| Onboarding (recovery phrase, restore, unlock) | ✅ Works |
| Journals library + "new journal" sheet (with templates) | ✅ Works |
| Calendar (month grid, day list, heatmap) | ✅ Works |
| Entry editor (TipTap: rich text, slash palette, labels, editable date) | ✅ Works |
| Durable local store (wa-sqlite on OPFS, per-owner, offline outbox) | ✅ Works |
| Media — video/audio recording, image & file attachments (all E2E-encrypted, chunked) | ✅ Works |
| Vault-wide search (⌘/Ctrl+K) | ✅ Works (substring; FTS5 blocked on a custom wasm build) |
| Entry templates (sync as encrypted blobs) | ✅ Works |
| Recovery-phrase rotation ("my mnemonic leaked") | ✅ Works |
| Responsive desktop / mobile + dark mode | ✅ Works |
| Backend relay (auth + encrypted-blob + media relay) | ✅ Built — see [`server/`](./server) |
| Seed at-rest (Argon2id), reminders UI + push, export/import, native shells | 🔜 Later |

So: the timeline seeds with hand-crafted sample content on first run so it looks lived-in, and
everything you write is **really** encrypted, stored durably on-device (wa-sqlite on OPFS, per
owner), and synced through the relay. The identity itself is still in-memory only — a reload locks
the app and asks for the mnemonic again (the Argon2id at-rest layer isn't built yet) — but your
entries are waiting right where you left them once you unlock.

The grand plan lives in [`CLAUDE.md`](./CLAUDE.md), the architectural source of truth (German, because
the author makes excellent decisions and slightly chaotic stylistic ones). Plain-English deep-dives
live in [`docs/`](./docs) — start with [`docs/README.md`](./docs/README.md).

---

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Components, key derivation, the sync sequence, data model — with diagrams |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | The E2EE model, crypto choices, and a frank list of attack vectors & known weaknesses |
| [`docs/API.md`](./docs/API.md) | The relay's HTTP API reference |
| [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) | Setup, quality gates, conventions, where things live |
| [`CLAUDE.md`](./CLAUDE.md) | The decision document & source of truth (German; §0 is an English guide) |

---

## Quick start

You'll need **Node 20+** and **pnpm 10** (the repo pins it; `corepack` will sort you out).

```bash
# 1. Wake up the package manager (one time)
corepack enable

# 2. Install the dependencies
pnpm install

# 3. Run the app
pnpm dev
```

Now open **http://localhost:5173** and behold a journal that politely refuses to read itself.

Every load drops you into onboarding, because the identity lives **only in memory** — the seed and
keys are never persisted (the Argon2id at-rest layer isn't built yet). "Start a new journal" generates
a real 12-word recovery phrase; "I have a recovery phrase" restores from one you type (a password
manager can save and fill it). A reload locks the app and asks again, which is the honest behaviour
until at-rest key storage lands.

> Onboarding generates a **real** mnemonic, derives **real** keys, and your entries are stored
> **durably** behind it (locally and on the relay). If you write things you care about, treat the
> phrase accordingly — write it down.

---

## The backend

There's also a Go relay (`journald`) — a deliberately clueless server that stores opaque encrypted
blobs and shuffles them between your devices. The whole thing runs from the repo root:

```bash
docker compose up -d        # Postgres + MinIO + the relay, on :8080
curl localhost:8080/healthz # {"status":"ok"}
```

The client **is** wired to it: onboarding generates a real recovery phrase, derives keys, registers a
device (challenge-response), and syncs XChaCha20-Poly1305-encrypted entries — plus chunked encrypted
media, relayed into MinIO — via the relay. To run the
whole thing end-to-end, start the relay (above) and then `pnpm dev` — the app points at
`http://localhost:8080` by default (override with `VITE_RELAY_URL`). The vault chip turns "synced ·
encrypted" once the handshake succeeds; if the relay is down, the app stays local and shows "offline".

Want to watch the crypto + sync round-trip without a browser? With the relay running:

```bash
pnpm --filter client exec tsx scripts/integration.ts   # register → auth → encrypt → push → pull → decrypt
```

Details, the API surface, and how to run the relay's own tests live in [`server/README.md`](./server/README.md).

---

## Testing and verifying

The client gates are typecheck + build:

```bash
pnpm typecheck    # TypeScript, strict mode, no excuses
pnpm build        # typecheck + a real production build
pnpm preview      # serve the production build locally, to admire your work
```

The relay has actual tests — unit tests (no DB), a `-tags e2e` integration test against Postgres, and
the client `scripts/integration.ts` round-trip that proves crypto + sync work end-to-end. The full
matrix lives in [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md). If `pnpm build` is green and
`go test ./...` is green, you're in good shape.

---

## Developing

### The map

```
mneme/
├── CLAUDE.md              # architecture & decisions (the source of truth; auf Deutsch)
├── docs/                  # plain-English deep-dives (architecture, security, API, contributing)
├── apps/
│   └── client/            # the Vite + Preact + TypeScript app (this is where the fun is)
│       ├── index.html
│       ├── vite.config.ts
│       ├── scripts/       # integration.ts + templates-roundtrip.ts — live client↔relay checks
│       └── src/
│           ├── crypto/    # mnemonic · keys (HKDF) · aead (XChaCha20) · chunked media · base64
│           ├── db/        # wa-sqlite on OPFS — the durable local store (worker + migrations)
│           ├── sync/      # relay client · identity · engine (push/pull) · media · rotate
│           ├── editor/    # TipTap config — toolbar, slash palette, inline media nodes
│           ├── state/     # data.tsx — identity, sync loop, live entries, outboxes
│           ├── styles/    # design tokens (warm-paper palette + dark theme)
│           ├── data/      # typed sample content + built-in templates
│           ├── ui/        # search, templates, capture, lightbox, labels — the shared bits
│           ├── hooks/     # useMediaQuery (desktop/mobile), useTheme (dark mode)
│           ├── screens/   # Onboarding · Journals · Calendar · Editor
│           ├── app.tsx    # the shell: sidebar on desktop, bottom-nav on mobile
│           └── main.tsx   # the "go" button
├── server/                # the Go relay (journald) — auth + encrypted-blob sync
├── docker-compose.yml     # Postgres + MinIO + server
└── (packages/proto/, apps/desktop/ — arriving in later build steps)
```

### The stack, and why

- **Vite + Preact + TypeScript** — fast, small, and one web codebase to rule both the PWA and
  (eventually) the native shells.
- **Design tokens in CSS variables** — every colour, font, and spacing value lives in
  `src/styles/tokens.css`. Want to retheme? Start there. Dark mode is just a `[data-theme]` swap.
- **Responsive by breakpoint** — above 920px you get the three-pane desktop layout; below, the
  mobile shell with a bottom nav. Same components, different chrome.

### House rules (the short version)

- **Code, comments, commits, and API are in English.** Only `CLAUDE.md` gets to be German.
- **TypeScript is `strict`.** Yes, all the way strict. It's load-bearing.
- Entry IDs are **random** (128-bit hex), never timestamp/date-encoded — a privacy thing (the relay
  sees ids in cleartext, so a time-encoded id would leak your writing order). See `docs/SECURITY.md`.
- When in doubt about *what* to build or *in what order*, `CLAUDE.md` §10 has the roadmap and
  §3 has the decisions that are Not To Be Re-litigated. (They were re-litigated once. It was a
  whole thing. Don't.)

---

## Roadmap (the abridged §10)

1. ✅ Scaffold the client + design system
2. ✅ The Go relay — device auth + last-write-wins encrypted-blob sync
3. ✅ Crypto layer — BIP39 → keys → XChaCha20-Poly1305, in the browser (@noble/@scure)
4. ✅ Wire the client to the relay — register, authenticate, encrypted push/pull
5. ✅ Durable local store (wa-sqlite + OPFS) + a real TipTap editor + offline outbox
6. ✅ Media — encrypted chunked video/audio/image/file attachments via MinIO
7. ✅ Templates, vault search, labels, recovery-phrase rotation *(you are here)*
8. 🔜 Seed at-rest (Argon2id), reminders UI + push transport, export/import, FTS5
9. 🔜 Native desktop + mobile shells (Tauri 2), built locally

---

## License

Open source. (Specific license to be added — for now, assume "be kind, and don't pretend you
wrote it.")

---

*Mneme — named after the Greek muse of memory, who, fittingly, did not offer a password reset
either.*
