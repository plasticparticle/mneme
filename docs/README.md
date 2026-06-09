# Mneme docs

Documentation index. Start here, then dive into whichever rabbit hole you need.

| Doc | What's in it |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the system fits together — components, key derivation, the sync sequence, the data model, and what's built vs. planned. Has diagrams. |
| [SECURITY.md](./SECURITY.md) | The E2EE model, the cryptographic building blocks and why, and a frank list of **attack vectors and known weaknesses** (mitigated / accepted / open). |
| [API.md](./API.md) | The relay's HTTP API — endpoints, request/response shapes, auth. |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Setup, the quality gates (typecheck/build/test/e2e), conventions, and where things live. |

Related, outside `docs/`:

- [`../CLAUDE.md`](../CLAUDE.md) — the **decision document** and source of truth (§1–§12 in German;
  §0 is an English operating guide). Locked decisions and the build-order roadmap live here.
- [`../README.md`](../README.md) — the friendly project overview + quick start.
- [`../server/README.md`](../server/README.md) — running and testing the Go relay specifically.

> If a doc here ever disagrees with `CLAUDE.md` on a *decision*, `CLAUDE.md` wins. These docs describe
> and explain; `CLAUDE.md` decides.
