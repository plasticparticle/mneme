# Installing Mneme as an app (PWA)

Mneme is a Progressive Web App: with a service worker and a web manifest it installs to a phone's home
screen or a desktop dock, launches in its own window, and works offline. This page is the **how** —
mostly the fiddly part, which is getting a *secure context* on a phone during development. For the
production side (Caddy + trusted HTTPS), see [DEPLOYMENT.md](./DEPLOYMENT.md#installing-it-as-an-app-pwa).

---

## The one rule that trips everyone up

A service worker — and therefore PWA install — only runs in a **secure context**. Exactly two things
count as secure:

1. **HTTPS with a trusted certificate**, or
2. **`localhost`** (on the same machine).

A LAN dev URL like `http://192.168.1.20:5173` is **neither**, so an Android phone will never offer to
install it — at best "Add to Home screen" makes a dumb bookmark, not an installed app. And a
*self-signed* HTTPS cert is worse than useless here: the browser flags the origin as having a
certificate error, and **service workers are blocked on cert-error origins**. So you can click through
the warning and *use* the site, but you still cannot *install* it.

The upshot: to test install on a phone you need HTTPS with a certificate the phone actually trusts.

---

## What's wired

- `vite-plugin-pwa` (Workbox `generateSW`) in `apps/client/vite.config.ts` generates a
  `registerType: 'autoUpdate'` service worker that precaches the app shell — JS/CSS/HTML, the
  wa-sqlite wasm, the bundled variable fonts, and the icons (~3.3 MiB) — and injects its registration
  into `index.html`.
- The hand-written `apps/client/public/manifest.webmanifest` stays the source of truth for name,
  icons (192/512 + maskable), `display: standalone`, and theme colour (the plugin only owns the SW —
  `manifest: false`).
- **In ordinary `pnpm dev` the service worker is off**, so day-to-day development isn't fighting stale
  cached assets. It switches on only in the HTTPS "test the install" mode below.
- **In a production build (`pnpm build`) the SW is always emitted** — served over the real HTTPS of a
  deployment, install works with zero extra config.

---

## Testing install from the dev server

### Option A — a tunnel (least friction, works on any phone)

A tunnel gives you a real, publicly-trusted HTTPS URL, so there is no certificate to install on the
phone at all.

```bash
pnpm --filter client dev --host          # plain dev is fine; the tunnel provides HTTPS
# in another terminal, point a tunnel at :5173, e.g.
cloudflared tunnel --url http://localhost:5173
#   → https://something-random.trycloudflare.com
```

Open that HTTPS URL on the phone → **⋮ → Install app**. Note you'll also want the relay
(`VITE_RELAY_URL`) reachable over HTTPS for a full end-to-end test; for a pure *installability* check
the app shell alone is enough.

### Option B — `mkcert` (a locally-trusted LAN cert)

Best if you test on the LAN often and don't want a tunnel. [`mkcert`](https://github.com/FiloSottile/mkcert)
creates a local CA and certs your devices can be told to trust.

```bash
# once, on the dev machine
mkcert -install
mkcert 192.168.1.20 localhost           # use your machine's actual LAN IP
#   → ./192.168.1.20+1.pem  and  ./192.168.1.20+1-key.pem

# serve dev over that cert
DEV_TLS_CERT=./192.168.1.20+1.pem \
DEV_TLS_KEY=./192.168.1.20+1-key.pem \
  pnpm --filter client dev --host
```

Then install `mkcert`'s **root CA** on the phone (Android: Settings → Security → Encryption &
credentials → Install a certificate → CA certificate; the file is `mkcert -CAROOT`/`rootCA.pem`). Now
`https://192.168.1.20:5173` is trusted on the phone → install works.

### Option C — `dev:https` (self-signed; localhost only)

```bash
pnpm --filter client dev:https           # = DEV_HTTPS=1 vite --host, via @vitejs/plugin-basic-ssl
```

This serves HTTPS with a self-signed cert. It's handy for verifying the SW/install flow **on the dev
machine itself** at `https://localhost:5173` (localhost is a secure context, and Chrome lets you
install despite the self-signed cert there). It will **not** make the app installable on a phone over
the LAN — that's the cert-error rule above. Use A or B for phones.

---

## Verifying / debugging installability

Chrome DevTools tells you exactly what's missing:

- **Application → Manifest** — shows the parsed manifest and an "Installability" section listing any
  unmet criterion (e.g. *"page is not served over a secure origin"*, *"no matching service worker"*).
- **Application → Service Workers** — should show an activated worker once you're on a secure origin.
- To debug the phone directly: `chrome://inspect` on the desktop over USB (remote debugging).

Common outcomes:

| Symptom | Cause | Fix |
|---|---|---|
| No install option on the phone, LAN URL | plain `http://` (not secure) | Option A or B |
| "Add to Home screen" makes a bookmark, not an app | no active service worker (cert error, or plain dev) | trusted HTTPS + SW enabled |
| Works on `localhost`, not on the phone | self-signed cert error blocks the SW | Option A or B (trusted cert) |
| Installed app shows stale content after a deploy | SW cache | `autoUpdate` refreshes on next launch; hard-reload or reinstall to force |

---

## Related

- Production HTTPS + install: [DEPLOYMENT.md](./DEPLOYMENT.md#installing-it-as-an-app-pwa)
- Why the client needs a secure context at all (OPFS, capture): [ARCHITECTURE.md](./ARCHITECTURE.md)
- The eventual native shells (persistent storage, push): [ROADMAP.md](./ROADMAP.md)
