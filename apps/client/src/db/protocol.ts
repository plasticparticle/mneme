// Message protocol between the main thread (db/index.ts) and the SQLite worker.
// The worker owns the only SQLite connection — OPFS sync access handles are
// worker-only — so every read/write crosses this boundary as a request/response
// pair correlated by a monotonic `id`.

export type SqlParam = string | number | null;

// SQLite hands blobs back as Uint8Array; we never store blobs (entries are text),
// but the type stays honest about what a column can hold.
export type SqlValue = string | number | Uint8Array | null;

export type DbRequest =
  | { id: number; kind: 'open'; dir: string; file: string }
  | { id: number; kind: 'run'; sql: string; params?: SqlParam[] }
  | { id: number; kind: 'query'; sql: string; params?: SqlParam[] }
  | { id: number; kind: 'batch'; statements: { sql: string; params?: SqlParam[] }[] };

export type DbResponse =
  | { id: number; ok: true; rows: SqlValue[][]; columns: string[] }
  | { id: number; ok: false; error: string };
