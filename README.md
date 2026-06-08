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

Right now Mneme is a **gorgeous front-end with stage fright**. The full UI for all four screens
is built and runs — but the crypto, the local database, the sync, and the server are still
backstage, stretching. What you can play with today:

| Thing | Status |
|---|---|
| Onboarding (recovery phrase, restore, unlock) | ✅ UI built |
| Journals library + "new journal" sheet | ✅ UI built |
| Calendar (month grid, day list, heatmap) | ✅ UI built |
| Entry editor (zen writing surface) | ✅ UI built |
| Responsive desktop / mobile + dark mode | ✅ Works |
| Backend relay (auth + encrypted-blob sync) | ✅ Built — see [`server/`](./server) |
| Client-side encryption, local DB, client↔server sync | 🔜 Coming, in that order |
| Media uploads, reminders push, native shells | 🔜 Later |

So: the data you see is lovingly hand-crafted sample content. Nothing is encrypted yet because
nothing is *real* yet. Don't pour your soul into it expecting it to persist. It won't. It's a
very convincing stage set.

The grand plan lives in [`CLAUDE.md`](./CLAUDE.md), which is the architectural source of truth.
Fair warning: that document is written in German, because the author makes excellent decisions
and slightly chaotic stylistic ones.

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

First run drops you into onboarding. Click through the recovery-phrase ceremony (you don't have
to actually engrave the words into a titanium plate *yet* — this is a demo). Once you're "in,"
your browser remembers via `localStorage`, so you go straight to the journals next time.

> **Want to re-watch the onboarding flow?** Clear the site's local storage, or run this in the
> dev console: `localStorage.removeItem('mneme.entered')` and refresh. Instant fresh start, no
> regrets.

---

## The backend

There's also a Go relay (`journald`) — a deliberately clueless server that stores opaque encrypted
blobs and shuffles them between your devices. The whole thing runs from the repo root:

```bash
docker compose up -d        # Postgres + MinIO + the relay, on :8080
curl localhost:8080/healthz # {"status":"ok"}
```

Details, the API surface, and how to run its tests live in [`server/README.md`](./server/README.md).
The client isn't wired to it yet — that's a later step — but the relay stands on its own and is tested.

---

## Testing and verifying

We don't have a sprawling test suite yet (there isn't much logic to test — it's mostly pixels
behaving themselves). What we *do* have are two honest gates:

```bash
pnpm typecheck    # TypeScript, strict mode, no excuses
pnpm build        # typecheck + a real production build
pnpm preview      # serve the production build locally, to admire your work
```

If `pnpm build` is green, you're in good shape. If it's red, TypeScript is trying to tell you
something and it is, annoyingly, usually right.

---

## Developing

### The map

```
mneme/
├── CLAUDE.md              # architecture & decisions (the source of truth; auf Deutsch)
├── apps/
│   └── client/            # the Vite + Preact + TypeScript app (this is where the fun is)
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── styles/    # design tokens (warm-paper palette + dark theme)
│           ├── data/      # typed sample content (stands in for the real DB, for now)
│           ├── ui/        # icons, buttons, chips, covers — the shared bits
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
- IDs are **ULIDs**, never date-encoded — a privacy thing, explained at length in `CLAUDE.md`.
- When in doubt about *what* to build or *in what order*, `CLAUDE.md` §10 has the roadmap and
  §3 has the decisions that are Not To Be Re-litigated. (They were re-litigated once. It was a
  whole thing. Don't.)

---

## Roadmap (the abridged §10)

1. ✅ Scaffold the client + design system
2. ✅ The Go relay — device auth + last-write-wins encrypted-blob sync *(you are here)*
3. 🔜 Local SQLite (wa-sqlite + OPFS + full-text search) and a real TipTap editor
4. 🔜 Crypto layer — BIP39 → keys → XChaCha20-Poly1305, all in the browser
5. 🔜 Wire the client to the relay — offline outbox, push/pull
6. 🔜 Media, reminders push, templates, export/import
7. 🔜 Native desktop + mobile shells (Tauri 2), built locally

---

## License

Open source. (Specific license to be added — for now, assume "be kind, and don't pretend you
wrote it.")

---

*Mneme — named after the Greek muse of memory, who, fittingly, did not offer a password reset
either.*
