// Forward-only schema for the local source-of-truth DB (CLAUDE.md §5a, §11).
//
// Everything here is plaintext: this DB lives only on the unlocked device, and
// the relay never sees it — only version-prefixed ciphertext blobs sync (§3, §5b).
// Migrations are append-only: never edit an existing entry, only push the next.
// The applied version is tracked in `PRAGMA user_version`.

export const MIGRATIONS: string[] = [
  // ── v1 — entries ──
  `
  CREATE TABLE entries (
    id          TEXT PRIMARY KEY,           -- random 128-bit hex, never date-encoded (§3)
    journal_id  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,           -- ms since epoch
    updated_at  INTEGER NOT NULL,           -- ms — also the LWW clock (§3)
    title       TEXT NOT NULL DEFAULT '',
    body_text   TEXT NOT NULL DEFAULT '',   -- flattened plaintext (previews + search)
    body_json   TEXT,                       -- TipTap/ProseMirror document JSON (rich source)
    labels      TEXT NOT NULL DEFAULT '[]', -- JSON array of label ids
    deleted     INTEGER NOT NULL DEFAULT 0,
    dirty       INTEGER NOT NULL DEFAULT 0  -- 1 → still waiting in the sync outbox
  );
  CREATE INDEX entries_journal ON entries(journal_id);
  CREATE INDEX entries_updated ON entries(updated_at);
  CREATE INDEX entries_dirty   ON entries(dirty) WHERE dirty = 1;
  `,
  // ── v2 (FUTURE) — FTS5 full-text index (§3 mandates FTS5 for search) ──
  // The published wa-sqlite 1.0.0 wasm builds are compiled WITHOUT the FTS5
  // module, so creating this table fails today ("no such module: fts5"). When we
  // ship an FTS5-enabled wasm, append the migration below as a forward-only step
  // and switch LocalDb.search() over to it; until then search() uses LIKE.
  //
  //   CREATE VIRTUAL TABLE entries_fts USING fts5(
  //     title, body_text, content='entries', content_rowid='rowid'
  //   );
  //   + AFTER INSERT/UPDATE/DELETE triggers to keep it in lockstep, then
  //     INSERT INTO entries_fts(entries_fts) VALUES('rebuild');
];

export const SCHEMA_VERSION = MIGRATIONS.length;
