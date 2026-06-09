// Main-thread handle to the local SQLite source of truth (CLAUDE.md §5a).
// Spawns the worker, correlates request/response by id, and maps rows to/from
// the JournalEntry shape the rest of the app already speaks. This is the durable
// local store; the in-memory list in state/data.tsx is a reactive mirror of it.
import type { DbRequest, DbResponse, SqlParam, SqlValue } from './protocol';
import type { JournalEntry, MediaAttachment } from '../sync/engine';

// Distributive omit so each variant of the DbRequest union keeps its own fields
// (a plain Omit<DbRequest, 'id'> would collapse to just the shared `kind`).
type RequestBody = DbRequest extends infer T ? (T extends { id: number } ? Omit<T, 'id'> : never) : never;

// One row of the `entries` table, in column order (see schema.ts v1+v2).
const COLS =
  'id, journal_id, created_at, updated_at, title, body_text, body_json, labels, attachments, deleted, dirty';

function rowToEntry(r: SqlValue[]): JournalEntry {
  const attachments = JSON.parse((r[8] as string) || '[]') as MediaAttachment[];
  return {
    id: r[0] as string,
    journalId: r[1] as string,
    createdAt: r[2] as number,
    updatedAt: r[3] as number,
    title: (r[4] as string) ?? '',
    bodyText: (r[5] as string) ?? '',
    bodyJson: (r[6] as string | null) ?? undefined,
    labels: JSON.parse((r[7] as string) || '[]') as string[],
    attachments: attachments.length ? attachments : undefined,
    deleted: !!(r[9] as number),
  };
}

// Bind values for an upsert, in column order. `dirty` is decided by the caller.
function entryParams(e: JournalEntry, dirty: 0 | 1): SqlParam[] {
  return [
    e.id,
    e.journalId,
    e.createdAt,
    e.updatedAt,
    e.title ?? '',
    e.bodyText ?? '',
    e.bodyJson ?? null,
    JSON.stringify(e.labels ?? []),
    JSON.stringify(e.attachments ?? []),
    e.deleted ? 1 : 0,
    dirty,
  ];
}

const ENTRY_PLACEHOLDERS = '(?,?,?,?,?,?,?,?,?,?,?)';

const UPSERT_SET =
  `journal_id=excluded.journal_id, created_at=excluded.created_at, updated_at=excluded.updated_at, ` +
  `title=excluded.title, body_text=excluded.body_text, body_json=excluded.body_json, ` +
  `labels=excluded.labels, attachments=excluded.attachments, deleted=excluded.deleted, dirty=excluded.dirty`;

// ── media rows (schema v2): plaintext bytes + upload-outbox flag ──

export interface MediaRecord {
  id: string;
  entryId: string;
  mime: string;
  bytes: number;
  durationMs?: number;
  createdAt: number;
  data: Uint8Array | null; // NULL until downloaded
  synced: boolean;
}

const MEDIA_COLS = 'id, entry_id, mime, bytes, duration_ms, created_at, data, synced';

function rowToMedia(r: SqlValue[]): MediaRecord {
  return {
    id: r[0] as string,
    entryId: r[1] as string,
    mime: r[2] as string,
    bytes: r[3] as number,
    durationMs: (r[4] as number | null) ?? undefined,
    createdAt: r[5] as number,
    data: (r[6] as Uint8Array | null) ?? null,
    synced: !!(r[7] as number),
  };
}

export class LocalDb {
  #worker: Worker | null = null;
  #seq = 0;
  #pending = new Map<number, { resolve: (r: DbResponse) => void; reject: (e: Error) => void }>();

  #send(req: RequestBody): Promise<DbResponse> {
    const w = this.#worker;
    if (!w) return Promise.reject(new Error('LocalDb not open'));
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      w.postMessage({ ...req, id } as DbRequest);
    });
  }

  async #query(sql: string, params?: SqlParam[]): Promise<SqlValue[][]> {
    const res = await this.#send({ kind: 'query', sql, params });
    if (!res.ok) throw new Error(res.error);
    return res.rows;
  }

  async #run(sql: string, params?: SqlParam[]): Promise<void> {
    const res = await this.#send({ kind: 'run', sql, params });
    if (!res.ok) throw new Error(res.error);
  }

  /** Open (and migrate) the per-owner database. Safe to call once per session. */
  async open(ownerId: string): Promise<void> {
    if (this.#worker) return;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<DbResponse>) => {
      const p = this.#pending.get(ev.data.id);
      if (p) {
        this.#pending.delete(ev.data.id);
        p.resolve(ev.data);
      }
    };
    this.#worker = worker;
    // base64url ownerId is filesystem-safe; one OPFS directory isolates each account.
    await this.#send({ kind: 'open', dir: `mneme/${ownerId}`, file: 'journal.db' }).then((r) => {
      if (!r.ok) throw new Error(r.error);
    });
  }

  /** All non-deleted entries, newest first — the timeline seed on unlock. */
  async allEntries(): Promise<JournalEntry[]> {
    const rows = await this.#query(
      `SELECT ${COLS} FROM entries WHERE deleted = 0 ORDER BY updated_at DESC`,
    );
    return rows.map(rowToEntry);
  }

  /** Ids of entries still awaiting a relay push (rebuilds the outbox after a reload). */
  async dirtyEntries(): Promise<JournalEntry[]> {
    const rows = await this.#query(`SELECT ${COLS} FROM entries WHERE dirty = 1`);
    return rows.map(rowToEntry);
  }

  /** A local edit: always wins on this device and is marked for the outbox. */
  async putLocal(e: JournalEntry): Promise<void> {
    await this.#run(
      `INSERT INTO entries (${COLS}) VALUES ${ENTRY_PLACEHOLDERS} ` +
        `ON CONFLICT(id) DO UPDATE SET ${UPSERT_SET}`,
      entryParams(e, 1),
    );
  }

  /** Merge relay entries under last-write-wins: only newer versions overwrite (§3). */
  async mergeRemote(entries: JournalEntry[]): Promise<void> {
    if (!entries.length) return;
    const statements = entries.map((e) => ({
      sql:
        `INSERT INTO entries (${COLS}) VALUES ${ENTRY_PLACEHOLDERS} ` +
        `ON CONFLICT(id) DO UPDATE SET ${UPSERT_SET} WHERE excluded.updated_at > entries.updated_at`,
      params: entryParams(e, 0),
    }));
    const res = await this.#send({ kind: 'batch', statements });
    if (!res.ok) throw new Error(res.error);
  }

  /** Clear the dirty flag for versions the relay acknowledged (precise on updated_at). */
  async markSynced(entries: JournalEntry[]): Promise<void> {
    if (!entries.length) return;
    const statements = entries.map((e) => ({
      sql: `UPDATE entries SET dirty = 0 WHERE id = ? AND updated_at = ?`,
      params: [e.id, e.updatedAt] as SqlParam[],
    }));
    const res = await this.#send({ kind: 'batch', statements });
    if (!res.ok) throw new Error(res.error);
  }

  /**
   * Search over titles + bodies, newest matches first. Interim LIKE scan until an
   * FTS5-enabled wasm lands (see schema.ts v2); §3 wants FTS5 to carry this.
   */
  async search(query: string): Promise<JournalEntry[]> {
    const q = query.trim();
    if (!q) return [];
    // Escape LIKE wildcards so user input is matched literally.
    const needle = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    const rows = await this.#query(
      `SELECT ${COLS} FROM entries ` +
        `WHERE deleted = 0 AND (title LIKE ? ESCAPE '\\' OR body_text LIKE ? ESCAPE '\\') ` +
        `ORDER BY updated_at DESC`,
      [needle, needle],
    );
    return rows.map(rowToEntry);
  }

  // ── media (schema v2) ──

  /** Store a media row (a fresh recording → synced=false; a download → synced=true). */
  async putMedia(m: MediaRecord): Promise<void> {
    await this.#run(
      `INSERT INTO media (${MEDIA_COLS}) VALUES (?,?,?,?,?,?,?,?) ` +
        `ON CONFLICT(id) DO UPDATE SET data=excluded.data, synced=excluded.synced`,
      [m.id, m.entryId, m.mime, m.bytes, m.durationMs ?? null, m.createdAt, m.data, m.synced ? 1 : 0],
    );
  }

  /** One media row (with bytes), or null if this device has never seen/fetched it. */
  async getMedia(id: string): Promise<MediaRecord | null> {
    const rows = await this.#query(`SELECT ${MEDIA_COLS} FROM media WHERE id = ?`, [id]);
    return rows.length ? rowToMedia(rows[0]) : null;
  }

  /** Media rows still awaiting a relay upload (rebuilds the media outbox after a reload). */
  async unsyncedMedia(): Promise<MediaRecord[]> {
    const rows = await this.#query(`SELECT ${MEDIA_COLS} FROM media WHERE synced = 0`);
    return rows.map(rowToMedia);
  }

  /** Clear the media outbox flag once the relay has the full object. */
  async markMediaSynced(id: string): Promise<void> {
    await this.#run(`UPDATE media SET synced = 1 WHERE id = ?`, [id]);
  }
}
