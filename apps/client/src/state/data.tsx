// AppData provider: holds the in-memory identity/session, the live entry list,
// and the background sync loop. Seed/identity live only in memory (re-enter the
// mnemonic on cold start); entry bodies are encrypted before they reach the relay.
import type { ComponentChildren, VNode } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { RelayClient, defaultRelayUrl } from '../sync/relay';
import { authenticate, identityFromMnemonic, type Session } from '../sync/identity';
import { pushEntries, pullEntries, type JournalEntry } from '../sync/engine';
import { newEntryId } from '../sync/ids';
import { ENTRIES, JOURNALS, type Journal } from '../data/sample';

export type SyncStatus = 'locked' | 'connecting' | 'online' | 'offline';

interface AppData {
  status: SyncStatus;
  entries: JournalEntry[];
  journals: Journal[];
  signIn(mnemonic: string): Promise<void>;
  createEntry(input: { journalId: string; title: string; bodyText?: string; labels?: string[] }): JournalEntry;
  newJournal(j: Journal): void;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used within <AppDataProvider>');
  return v;
}

const SYNC_INTERVAL_MS = 30_000;

// Seed the timeline from the design's sample entries so the UI looks lived-in.
// These stay local (not pushed); only user-created entries sync to the relay.
function seedEntries(): JournalEntry[] {
  return ENTRIES.map((e) => {
    const [h, m] = e.time.split(':').map(Number);
    const at = Date.UTC(2026, 5, e.day, h || 0, m || 0);
    return {
      id: e.id,
      journalId: e.journal,
      title: e.title,
      bodyText: e.preview,
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
  const [status, setStatus] = useState<SyncStatus>('locked');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [journals, setJournals] = useState<Journal[]>(JOURNALS);

  const session = useRef<Session | null>(null);
  const cursor = useRef(0);
  const pending = useRef<Map<string, JournalEntry>>(new Map());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    const s = session.current;
    if (!s || pending.current.size === 0) return;
    const batch = [...pending.current.values()];
    try {
      const applied = await pushEntries(relay, s.token, s.identity.dataKey, batch);
      for (const id of applied) pending.current.delete(id);
      setStatus('online');
    } catch {
      setStatus('offline');
    }
  }, [relay]);

  const pull = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    try {
      const res = await pullEntries(relay, s.token, s.identity.dataKey, cursor.current);
      cursor.current = res.cursor;
      if (res.entries.length) setEntries((prev) => mergeByLWW(prev, res.entries));
      setStatus('online');
    } catch {
      setStatus('offline');
    }
  }, [relay]);

  const signIn = useCallback(
    async (mnemonic: string) => {
      const identity = identityFromMnemonic(mnemonic); // local, synchronous
      setEntries((prev) => (prev.length ? prev : seedEntries()));
      setStatus('connecting');
      try {
        session.current = await authenticate(relay, identity);
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

  const createEntry: AppData['createEntry'] = useCallback(
    (input) => {
      const now = Date.now();
      const entry: JournalEntry = {
        id: newEntryId(),
        journalId: input.journalId,
        title: input.title,
        bodyText: input.bodyText ?? '',
        labels: input.labels ?? [],
        createdAt: now,
        updatedAt: now,
      };
      setEntries((prev) => mergeByLWW(prev, [entry]));
      pending.current.set(entry.id, entry);
      void flush();
      return entry;
    },
    [flush],
  );

  const newJournal = useCallback((j: Journal) => {
    setJournals((prev) => [...prev, j]);
  }, []);

  // Background sync loop while a session is live.
  useEffect(() => {
    if (status !== 'online' && status !== 'offline') return;
    timer.current = setInterval(() => {
      void flush();
      void pull();
    }, SYNC_INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [status, flush, pull]);

  const value: AppData = { status, entries, journals, signIn, createEntry, newJournal };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
