// AppData provider: holds the in-memory identity/session, the live entry list,
// and the background sync loop. Seed/identity live only in memory (re-enter the
// mnemonic on cold start); entry bodies are encrypted before they reach the relay.
import type { ComponentChildren, VNode } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { RelayClient, defaultRelayUrl } from '../sync/relay';
import { authenticate, identityFromMnemonic, type Session } from '../sync/identity';
import type { Identity } from '../crypto/keys';
import { pushEntries, pullEntries, type JournalEntry } from '../sync/engine';
import { newEntryId } from '../sync/ids';
import { ENTRIES, JOURNALS, OPEN_ENTRY, type Journal } from '../data/sample';
import { blocksToDoc, textToDoc, docToText } from '../editor/doc';
import { LocalDb } from '../db';

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
  updateEntry(id: string, patch: { title?: string; bodyText?: string; bodyJson?: string; labels?: string[] }): void;
  newJournal(j: Journal): void;
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mirror the (mutable) outbox depth into reactive state so the UI can react.
  const syncPendingCount = useCallback(() => setPendingCount(pending.current.size), []);

  const flush = useCallback(async () => {
    const s = session.current;
    if (!s || pending.current.size === 0) return;
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
  }, [relay, db, syncPendingCount]);

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
        // Rebuild the outbox from edits left unsynced by a previous offline session.
        for (const e of await db.dirtyEntries()) pending.current.set(e.id, e);
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

  // Live notebook counts, derived from the actual entries rather than hardcoded.
  const journalsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.deleted) continue;
      counts.set(e.journalId, (counts.get(e.journalId) ?? 0) + 1);
    }
    return journals.map((j) => ({ ...j, count: counts.get(j.id) ?? 0 }));
  }, [journals, entries]);

  const value: AppData = { status, pendingCount, saving, entries, journals: journalsWithCounts, signIn, createEntry, updateEntry, newJournal };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
