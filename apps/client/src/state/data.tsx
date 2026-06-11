// AppData provider: holds the in-memory identity/session, the live entry list,
// and the background sync loop. Seed/identity live only in memory (re-enter the
// mnemonic on cold start); entry bodies are encrypted before they reach the relay.
import type { ComponentChildren, VNode } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { RelayClient, RelayError, defaultRelayUrl } from '../sync/relay';
import { authenticate, identityFromMnemonic, type Session } from '../sync/identity';
import type { Identity } from '../crypto/keys';
import { pushEntries, pullEntries, type JournalEntry, type MediaAttachment } from '../sync/engine';
import { uploadMedia, downloadMedia } from '../sync/media';
import { newEntryId, newMediaId } from '../sync/ids';
import { ENTRIES, JOURNALS, OPEN_ENTRY, type Journal } from '../data/sample';
import { blocksToDoc, textToDoc, docToText } from '../editor/doc';
import { LocalDb, type MediaRecord } from '../db';

export type SyncStatus = 'locked' | 'connecting' | 'online' | 'offline';

interface AppData {
  status: SyncStatus;
  // How many local entries still wait to be pushed to the relay (the outbox depth).
  pendingCount: number;
  // True while a push to the relay is in flight.
  saving: boolean;
  entries: JournalEntry[];
  journals: Journal[];
  signIn(mnemonic: string): Promise<void>;
  createEntry(input: { journalId: string; title?: string; bodyText?: string; bodyJson?: string; labels?: string[] }): JournalEntry;
  updateEntry(id: string, patch: { title?: string; bodyText?: string; bodyJson?: string; labels?: string[]; createdAt?: number }): void;
  newJournal(j: Journal): void;
  /** Attach a freshly-recorded video to an entry; uploads in the background. */
  addVideo(entryId: string, blob: Blob, durationMs?: number): Promise<MediaAttachment | null>;
  /** Resolve an attachment to playable bytes: local DB first, then relay download. */
  mediaBlob(entryId: string, att: MediaAttachment): Promise<Blob | null>;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used within <AppDataProvider>');
  return v;
}

const SYNC_INTERVAL_MS = 30_000;
// While disconnected, retry authentication on this cadence so the client recovers
// on its own once the relay comes back — no need to re-enter the mnemonic.
const RECONNECT_INTERVAL_MS = 5_000;

// Seed the timeline from the design's sample entries so the UI looks lived-in.
// These stay local (not pushed); only user-created entries sync to the relay.
function seedEntries(): JournalEntry[] {
  return ENTRIES.map((e) => {
    const [h, m] = e.time.split(':').map(Number);
    const at = Date.UTC(2026, 5, e.day, h || 0, m || 0);
    // e1 has a fully-written rich body in the design handoff; give it real
    // TipTap content so the editor opens with lived-in formatting. The rest
    // start from their one-line preview text.
    const doc = e.id === OPEN_ENTRY.id ? blocksToDoc(OPEN_ENTRY.blocks) : textToDoc(e.preview);
    return {
      id: e.id,
      journalId: e.journal,
      title: e.title,
      bodyText: e.id === OPEN_ENTRY.id ? docToText(doc) : e.preview,
      bodyJson: JSON.stringify(doc),
      labels: e.labels,
      createdAt: at,
      updatedAt: at,
    };
  });
}

function mergeByLWW(prev: JournalEntry[], incoming: JournalEntry[]): JournalEntry[] {
  const byId = new Map(prev.map((e) => [e.id, e]));
  for (const e of incoming) {
    const cur = byId.get(e.id);
    if (!cur || e.updatedAt > cur.updatedAt) byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

// Blob wants a plain ArrayBuffer; bytes from the DB/crypto layers are typed over
// ArrayBufferLike, so copy into a fresh buffer (also detaches any subarray view).
function bytesToBlob(data: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  return new Blob([copy.buffer], { type });
}

// Local-midnight of a timestamp, so "days ago" counts calendar days, not 24h spans.
function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A short relative label for a notebook's most-recent edit ("Today", "3 days ago",
// "12 Jun"). `last` was a hardcoded sample string; this derives it from real data.
export function relativeDay(ts: number, now: number): string {
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(ts)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function AppDataProvider({ children }: { children: ComponentChildren }): VNode {
  const relay = useMemo(() => new RelayClient(defaultRelayUrl()), []);
  // The durable local source of truth (wa-sqlite, §5a). `entries` below is a
  // reactive mirror of it; writes go to both so the UI updates synchronously.
  const db = useMemo(() => new LocalDb(), []);
  const [status, setStatus] = useState<SyncStatus>('locked');
  const [pendingCount, setPendingCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [journals, setJournals] = useState<Journal[]>(JOURNALS);

  const session = useRef<Session | null>(null);
  // Kept after sign-in so the background loop can re-authenticate without the mnemonic.
  const identity = useRef<Identity | null>(null);
  // False when OPFS is unavailable (older browser / SSR): we degrade to an
  // in-memory session so the app still works, just without local persistence.
  const dbReady = useRef(false);
  const cursor = useRef(0);
  const pending = useRef<Map<string, JournalEntry>>(new Map());
  // Media upload outbox: recordings (with bytes) not yet fully on the relay.
  const pendingMedia = useRef<Map<string, MediaRecord>>(new Map());
  const mediaFlushing = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mirror the (mutable) outbox depth into reactive state so the UI can react.
  const syncPendingCount = useCallback(
    () => setPendingCount(pending.current.size + pendingMedia.current.size),
    [],
  );

  // Upload queued recordings one media object at a time (chunked inside uploadMedia).
  // Runs after the entry flush so the attachment metadata usually lands first.
  const flushMedia = useCallback(async () => {
    const s = session.current;
    if (!s || mediaFlushing.current || pendingMedia.current.size === 0) return;
    mediaFlushing.current = true;
    try {
      for (const rec of [...pendingMedia.current.values()]) {
        if (!rec.data) {
          pendingMedia.current.delete(rec.id); // nothing to upload (shouldn't happen)
          continue;
        }
        await uploadMedia(relay, s.token, s.identity.mediaKey, rec.id, rec.data);
        pendingMedia.current.delete(rec.id);
        if (dbReady.current) void db.markMediaSynced(rec.id);
        syncPendingCount();
      }
    } catch (e) {
      // 503 = relay has no object store configured; recordings stay queued
      // locally without flapping the connection indicator to "offline".
      if (!(e instanceof RelayError && e.status === 503)) setStatus('offline');
    } finally {
      mediaFlushing.current = false;
    }
  }, [relay, db, syncPendingCount]);

  const flush = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    if (pending.current.size === 0) {
      void flushMedia(); // no dirty entries, but recordings may still be queued
      return;
    }
    const batch = [...pending.current.values()];
    setSaving(true);
    try {
      const applied = await pushEntries(relay, s.token, s.identity.dataKey, batch);
      for (const id of applied) pending.current.delete(id);
      // Clear the dirty flag locally for exactly the versions the relay accepted.
      if (dbReady.current) void db.markSynced(batch.filter((e) => applied.has(e.id)));
      syncPendingCount();
      setStatus('online');
    } catch {
      setStatus('offline');
    } finally {
      setSaving(false);
    }
    void flushMedia();
  }, [relay, db, syncPendingCount, flushMedia]);

  const pull = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    try {
      const res = await pullEntries(relay, s.token, s.identity.dataKey, cursor.current);
      cursor.current = res.cursor;
      if (res.entries.length) {
        setEntries((prev) => mergeByLWW(prev, res.entries));
        // Persist the merge (the DB enforces the same LWW guard before overwriting).
        if (dbReady.current) void db.mergeRemote(res.entries);
      }
      setStatus('online');
    } catch {
      setStatus('offline');
    }
  }, [relay, db]);

  // (Re)establish a relay session from the stored identity, then sync. `announce`
  // shows the "connecting…" state for a user-initiated attempt; background retries
  // stay quiet on "offline" until one succeeds, so the indicator doesn't flicker.
  const connect = useCallback(
    async (announce: boolean) => {
      const id = identity.current;
      if (!id) return;
      if (announce) setStatus('connecting');
      try {
        session.current = await authenticate(relay, id);
        cursor.current = 0;
        await flush();
        await pull();
        setStatus('online');
      } catch {
        // Local-first: identity is valid; the relay is just unreachable right now.
        setStatus('offline');
      }
    },
    [relay, flush, pull],
  );

  const signIn = useCallback(
    async (mnemonic: string) => {
      const id = identityFromMnemonic(mnemonic); // local, synchronous
      identity.current = id;
      try {
        // Open the per-owner local DB and hydrate the timeline from it.
        await db.open(id.ownerId);
        dbReady.current = true;
        let local = await db.allEntries();
        if (local.length === 0) {
          // First run on this device: lay down the lived-in sample timeline.
          // Seed rows are written non-dirty, so they stay local and never push.
          local = seedEntries();
          await db.mergeRemote(local);
        }
        setEntries([...local].sort((a, b) => b.updatedAt - a.updatedAt));
        // Rebuild the outboxes from work left unsynced by a previous offline session.
        for (const e of await db.dirtyEntries()) pending.current.set(e.id, e);
        for (const m of await db.unsyncedMedia()) pendingMedia.current.set(m.id, m);
        syncPendingCount();
      } catch {
        // OPFS unavailable: run in-memory only (no persistence this session).
        dbReady.current = false;
        setEntries((prev) => (prev.length ? prev : seedEntries()));
      }
      await connect(true);
    },
    [db, connect, syncPendingCount],
  );

  const createEntry: AppData['createEntry'] = useCallback(
    (input) => {
      const now = Date.now();
      const entry: JournalEntry = {
        id: newEntryId(),
        journalId: input.journalId,
        title: input.title ?? '',
        bodyText: input.bodyText ?? '',
        bodyJson: input.bodyJson,
        labels: input.labels ?? [],
        createdAt: now,
        updatedAt: now,
      };
      setEntries((prev) => mergeByLWW(prev, [entry]));
      if (dbReady.current) void db.putLocal(entry);
      pending.current.set(entry.id, entry);
      syncPendingCount();
      void flush();
      return entry;
    },
    [db, flush, syncPendingCount],
  );

  const updateEntry: AppData['updateEntry'] = useCallback(
    (id, patch) => {
      const now = Date.now();
      setEntries((prev) => {
        const cur = prev.find((e) => e.id === id);
        if (!cur) return prev;
        const next: JournalEntry = { ...cur, ...patch, updatedAt: now };
        if (dbReady.current) void db.putLocal(next);
        pending.current.set(id, next);
        syncPendingCount();
        void flush();
        return mergeByLWW(prev, [next]);
      });
    },
    [db, flush, syncPendingCount],
  );

  const newJournal = useCallback((j: Journal) => {
    setJournals((prev) => [...prev, j]);
  }, []);

  // Attach a recording: bytes go to the local DB + media outbox; the attachment
  // metadata rides inside the (encrypted) entry body so other devices learn the
  // media id. The relay only ever sees that random id and ciphertext chunks.
  const addVideo: AppData['addVideo'] = useCallback(
    async (entryId, blob, durationMs) => {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (data.length === 0) return null;
      const now = Date.now();
      const att: MediaAttachment = {
        id: newMediaId(),
        kind: 'video',
        mime: blob.type || 'video/webm',
        bytes: data.length,
        durationMs,
        createdAt: now,
      };
      const rec: MediaRecord = {
        id: att.id,
        entryId,
        mime: att.mime,
        bytes: att.bytes,
        durationMs,
        createdAt: now,
        data,
        synced: false,
      };
      if (dbReady.current) void db.putMedia(rec);
      pendingMedia.current.set(rec.id, rec);
      let attached = false;
      setEntries((prev) => {
        const cur = prev.find((e) => e.id === entryId);
        if (!cur) return prev;
        attached = true;
        const next: JournalEntry = { ...cur, attachments: [...(cur.attachments ?? []), att], updatedAt: now };
        if (dbReady.current) void db.putLocal(next);
        pending.current.set(entryId, next);
        return mergeByLWW(prev, [next]);
      });
      syncPendingCount();
      void flush();
      return attached ? att : null;
    },
    [db, flush, syncPendingCount],
  );

  // Resolve attachment bytes for playback: outbox → local DB → relay download
  // (decrypted with the media key, then cached locally for next time).
  const mediaBlob: AppData['mediaBlob'] = useCallback(
    async (entryId, att) => {
      const queued = pendingMedia.current.get(att.id);
      if (queued?.data) return bytesToBlob(queued.data, att.mime);
      if (dbReady.current) {
        const row = await db.getMedia(att.id).catch(() => null);
        if (row?.data) return bytesToBlob(row.data, row.mime || att.mime);
      }
      const s = session.current;
      if (!s) return null;
      try {
        const data = await downloadMedia(relay, s.token, s.identity.mediaKey, att.id);
        if (dbReady.current) {
          void db.putMedia({
            id: att.id,
            entryId,
            mime: att.mime,
            bytes: att.bytes,
            durationMs: att.durationMs,
            createdAt: att.createdAt,
            data,
            synced: true,
          });
        }
        return bytesToBlob(data, att.mime);
      } catch {
        return null; // offline, not yet uploaded by the other device, or relay has no object store
      }
    },
    [db, relay],
  );

  // Background loop. While online: periodic flush + pull. While offline: retry the
  // relay handshake until it comes back, then resume syncing automatically.
  useEffect(() => {
    if (status === 'online') {
      timer.current = setInterval(() => {
        void flush();
        void pull();
      }, SYNC_INTERVAL_MS);
    } else if (status === 'offline') {
      timer.current = setInterval(() => {
        void connect(false);
      }, RECONNECT_INTERVAL_MS);
    } else {
      return;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [status, flush, pull, connect]);

  // Live notebook counts + last-edited labels, derived from the actual entries
  // rather than hardcoded. `last` is '' for an empty notebook so the UI can
  // distinguish "never written in" from a real timestamp.
  const journalsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const latest = new Map<string, number>();
    for (const e of entries) {
      if (e.deleted) continue;
      counts.set(e.journalId, (counts.get(e.journalId) ?? 0) + 1);
      latest.set(e.journalId, Math.max(latest.get(e.journalId) ?? 0, e.updatedAt));
    }
    const now = Date.now();
    return journals.map((j) => {
      const last = latest.get(j.id);
      return { ...j, count: counts.get(j.id) ?? 0, last: last ? relativeDay(last, now) : '' };
    });
  }, [journals, entries]);

  const value: AppData = { status, pendingCount, saving, entries, journals: journalsWithCounts, signIn, createEntry, updateEntry, newJournal, addVideo, mediaBlob };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
