// AppData provider: holds the in-memory identity/session, the live entry list,
// and the background sync loop. Seed/identity live in memory; at rest the seed
// is either nowhere (re-enter the mnemonic on cold start — the default) or, if
// the user opted in, sealed under an Argon2id passphrase in IndexedDB (§6).
// Entry bodies are encrypted before they reach the relay either way.
import type { ComponentChildren, VNode } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { RelayClient, RelayError, defaultRelayUrl } from '../sync/relay';
import { authenticate, type Session } from '../sync/identity';
import { deriveIdentity, type Identity } from '../crypto/keys';
import { mnemonicToSeed } from '../crypto/mnemonic';
import { sealSeed, sealWithKey, openSeed, type WrapKey } from '../crypto/seedlock';
import { loadSealedSeed, storeSealedSeed, clearSealedSeed, loadAiSettingsRecord, storeAiSettingsRecord, clearAiSettingsRecord } from '../platform/keystore';
import { sealAiSettings, openAiSettings } from '../ai/settings';
import type { AiSettings } from '../ai/types';
import { pushEntries, pushTemplates, pushInterviewTypes, pullEntries, type JournalEntry, type MediaAttachment, type TemplateRecord, type InterviewType } from '../sync/engine';
import { uploadMedia, downloadMedia } from '../sync/media';
import { rotateAccount, type RotationProgress } from '../sync/rotate';
import { newEntryId, newMediaId, newTemplateId } from '../sync/ids';
import { ENTRIES, JOURNALS, type Journal, type CoverPattern } from '../data/sample';
import { seedBuiltinTemplates } from '../data/templates';
import { seedBuiltinInterviews } from '../data/interviews';
import type { JSONContent } from '@tiptap/core';
import { blocksToDoc, textToDoc, docToText, docMediaIds } from '../editor/doc';
import { LocalDb, destroyOwnerDb, type MediaRecord } from '../db';
import { makeThumbnail } from '../ui/thumbnail';

export type SyncStatus = 'locked' | 'connecting' | 'online' | 'offline';

interface AppData {
  status: SyncStatus;
  // Whether an Argon2id-sealed seed exists on this device: true → the lock
  // screen offers passphrase unlock; null → the keystore check hasn't resolved
  // yet (don't render onboarding until it has, or the unlock view flashes).
  hasVault: boolean | null;
  // The vault's opaque owner id while unlocked (base64url(sha256(ownerPub)) —
  // already cleartext on the relay, so showing it leaks nothing). Its first 8
  // chars match the truncated vault label in the operator admin dashboard.
  ownerId: string | null;
  // How many local entries still wait to be pushed to the relay (the outbox depth).
  pendingCount: number;
  // Notebook ids that still have entries waiting in the push outbox — drives the
  // per-journal "Syncing…" badge so a bulk import shows which notebooks are still
  // catching up. Media-only tails are reflected in `pendingCount`, not here.
  pendingJournalIds: Set<string>;
  // True while a push to the relay is in flight.
  saving: boolean;
  // True from sign-in until the first sync attempt finishes (pull done or
  // offline). While set, an empty timeline means "still arriving" — screens
  // show a syncing notice instead of an empty state.
  bootstrapping: boolean;
  entries: JournalEntry[];
  journals: Journal[];
  // Entry templates — built-in seeds and user-created records alike, tombstones
  // included (callers filter on `deleted`).
  templates: TemplateRecord[];
  // Guided-interview types — built-in seeds and user-created records alike,
  // tombstones included (callers filter on `deleted`). Sync like templates.
  interviewTypes: InterviewType[];
  // AI assistant configuration (client-only feature; the relay is never involved).
  // null while locked or when the feature was never set up — every AI surface
  // hides itself in that case. Decrypted from its sealed IndexedDB record on
  // unlock; the seal key derives from the vault seed.
  aiSettings: AiSettings | null;
  /** Persist (sealed) and apply new AI settings; null disables and clears the record. */
  saveAiSettings(s: AiSettings | null): Promise<void>;
  /**
   * Enter with the recovery phrase. With `passphrase` set, the derived seed is
   * additionally sealed (Argon2id → XChaCha20) into IndexedDB so later cold
   * starts can unlock with the passphrase; without it, any previously stored
   * seal is removed and nothing about the identity touches disk.
   */
  signIn(mnemonic: string, passphrase?: string): Promise<void>;
  /** Cold-start path when a sealed seed exists. Rejects on a wrong passphrase. */
  unlock(passphrase: string): Promise<void>;
  /** Drop the in-memory identity and return to the lock screen. */
  lock(): void;
  createEntry(input: { journalId: string; title?: string; bodyText?: string; bodyJson?: string; labels?: string[] }): JournalEntry;
  updateEntry(id: string, patch: { journalId?: string; title?: string; bodyText?: string; bodyJson?: string; labels?: string[]; createdAt?: number; attachments?: MediaAttachment[] }): void;
  /**
   * After the user confirmed: tombstone the entry (the deletion syncs to other
   * devices through the LWW oplog) and delete every recording it references —
   * locally and on the relay.
   */
  deleteEntry(id: string): void;
  newJournal(j: Journal): void;
  /**
   * Restyle an existing notebook — rename it and/or change its colour or cover.
   * Journals are a local-only grouping, so this only touches this device's
   * `journals` table (nothing syncs). `count`/`last` are derived and ignored.
   */
  updateJournal(id: string, patch: { name?: string; subtitle?: string; color?: string; cover?: CoverPattern }): void;
  /**
   * After the user typed "delete": remove the notebook and tombstone every entry
   * in it (the deletions sync to other devices through the LWW oplog, and the
   * entries' recordings are purged locally and on the relay). The journal row
   * itself is a local grouping — it disappears from this device immediately.
   */
  deleteJournal(id: string): void;
  createTemplate(input: { name: string; bodyText?: string; bodyJson?: string }): TemplateRecord;
  updateTemplate(id: string, patch: { name?: string; bodyText?: string; bodyJson?: string }): void;
  /** Tombstones the template (built-ins included) so the deletion reaches other devices. */
  deleteTemplate(id: string): void;
  createInterviewType(input: { name: string; intro?: string; prompt?: string }): InterviewType;
  updateInterviewType(id: string, patch: { name?: string; intro?: string; prompt?: string }): void;
  /** Tombstones the interview type (built-ins included) so the deletion reaches other devices. */
  deleteInterviewType(id: string): void;
  /**
   * Persist a freshly-recorded clip or uploaded file locally and queue its
   * background upload. Returns the attachment metadata for the caller to embed
   * in the entry document (the editor inserts it as an inline node in bodyJson).
   */
  addMedia(
    entryId: string,
    kind: MediaAttachment['kind'],
    blob: Blob,
    meta?: { durationMs?: number; name?: string; width?: number; height?: number },
  ): Promise<MediaAttachment | null>;
  /**
   * After the user confirmed deleting a recording: purge its local bytes +
   * upload-queue slot and delete it from the relay (queued durably if offline).
   */
  removeMedia(mediaId: string): void;
  /** Resolve an attachment to playable bytes: local DB first, then relay download. */
  mediaBlob(entryId: string, att: MediaAttachment): Promise<Blob | null>;
  /**
   * Resolve a small thumbnail for an image attachment (the overview lists). Served
   * from the cached downscaled JPEG when present; otherwise generated once from the
   * full bytes and persisted. Returns null for non-images or when bytes are unreachable.
   */
  mediaThumb(entryId: string, att: MediaAttachment): Promise<Blob | null>;
  /**
   * Replace the recovery phrase: re-encrypt the vault under `newMnemonic` (a new
   * owner), wipe the old account from the relay, and re-home local state. Throws
   * (with the old account fully intact) if anything fails before the wipe.
   */
  rotatePhrase(newMnemonic: string, onProgress?: (p: RotationProgress) => void): Promise<void>;
  /**
   * Permanently delete the vault. Wipes the account from the relay (entries,
   * media, reminders, devices, sessions — the §5b cascade), then erases this
   * device: the plaintext OPFS DB and any at-rest seal. Ends back at onboarding.
   * Other devices keep their local copies but stop syncing; the same phrase
   * re-registers as an empty vault (TOFU). Throws — with everything intact —
   * when the relay can't be reached: deleting needs an explicit online "yes",
   * never an offline queue.
   */
  deleteVault(): Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used within <AppDataProvider>');
  return v;
}

// Cheap equality so the per-journal pending set only triggers a re-render when
// its membership actually changes (syncPendingCount fires on every outbox poke).
function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

const SYNC_INTERVAL_MS = 30_000;
// While disconnected, retry authentication on this cadence so the client recovers
// on its own once the relay comes back — no need to re-enter the mnemonic.
const RECONNECT_INTERVAL_MS = 5_000;
// §6 auto-lock: drop the in-memory keys after this much inactivity. Armed only
// when a sealed seed exists — without one, locking would force re-typing the
// twelve words, punishing exactly the users who chose the stricter setting.
const AUTO_LOCK_MS = 15 * 60_000;

// Seed the timeline with the Tutorial walkthrough entries on a fresh vault.
// These stay local (not pushed); only user-created entries sync to the relay.
function seedEntries(): JournalEntry[] {
  return ENTRIES.map((e) => {
    const [h, m] = e.time.split(':').map(Number);
    const at = Date.UTC(2026, 5, e.day, h || 0, m || 0);
    // Tutorial entries carry rich block bodies (real TipTap content, so the
    // editor opens with the features they describe); anything without blocks
    // starts from its one-line preview text.
    const doc = e.blocks ? blocksToDoc(e.blocks) : textToDoc(e.preview);
    return {
      id: e.id,
      journalId: e.journal,
      title: e.title,
      bodyText: e.blocks ? docToText(doc) : e.preview,
      bodyJson: JSON.stringify(doc),
      labels: e.labels,
      createdAt: at,
      updatedAt: at,
    };
  });
}

function mergeByLWW<T extends { id: string; updatedAt: number }>(prev: T[], incoming: T[]): T[] {
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

// New entries are headlined with their local creation time ("2026-06-12 14:03:55")
// instead of starting untitled.
function defaultEntryTitle(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingJournalIds, setPendingJournalIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  // Journals live in the local DB only (a per-device grouping, §3) — loaded on
  // unlock; the sample notebooks seed once per device like entries/templates.
  const [journals, setJournals] = useState<Journal[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [interviewTypes, setInterviewTypes] = useState<InterviewType[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);

  const session = useRef<Session | null>(null);
  // Kept after sign-in so the background loop can re-authenticate without the mnemonic.
  const identity = useRef<Identity | null>(null);
  // The Argon2id wrap key while unlocked-with-persistence: lets phrase rotation
  // re-seal the new seed without asking for the passphrase again.
  const wrap = useRef<WrapKey | null>(null);
  // False when OPFS is unavailable (older browser / SSR): we degrade to an
  // in-memory session so the app still works, just without local persistence.
  const dbReady = useRef(false);
  const cursor = useRef(0);
  const pending = useRef<Map<string, JournalEntry>>(new Map());
  // Template outbox: created/edited/tombstoned templates not yet on the relay.
  const pendingTemplates = useRef<Map<string, TemplateRecord>>(new Map());
  // Interview-type outbox: created/edited/tombstoned types not yet on the relay.
  const pendingInterviewTypes = useRef<Map<string, InterviewType>>(new Map());
  // Media upload outbox: recordings (with bytes) not yet fully on the relay.
  const pendingMedia = useRef<Map<string, MediaRecord>>(new Map());
  // Media deletion queue: confirmed deletes the relay hasn't acknowledged yet
  // (mirrored in the media_tombstones table so they survive reloads).
  const pendingMediaDeletes = useRef<Set<string>>(new Set());
  const mediaFlushing = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // One async check at startup: does a sealed seed exist on this device?
  useEffect(() => {
    void loadSealedSeed().then((rec) => setHasVault(rec !== null));
  }, []);

  // Connection-status setter for the background paths (flush/pull/connect):
  // no-ops once locked, so an in-flight sync resolving after lock() can't flip
  // the lock screen back to "online".
  const setStatusLive = useCallback((next: Exclude<SyncStatus, 'locked'>) => {
    if (identity.current) setStatus(next);
  }, []);

  // Mirror the (mutable) outbox depth into reactive state so the UI can react.
  const syncPendingCount = useCallback(() => {
    setPendingCount(
      pending.current.size +
        pendingTemplates.current.size +
        pendingInterviewTypes.current.size +
        pendingMedia.current.size +
        pendingMediaDeletes.current.size,
    );
    // Per-notebook view of the entry outbox for the journal-card sync badge.
    const js = new Set<string>();
    for (const e of pending.current.values()) js.add(e.journalId);
    setPendingJournalIds((prev) => (sameSet(prev, js) ? prev : js));
  }, []);

  // Upload queued recordings one media object at a time (chunked inside uploadMedia),
  // then push queued deletions. Runs after the entry flush so the attachment
  // metadata usually lands first. Uploads strictly before deletions: a recording
  // deleted while its upload was already snapshotted gets uploaded, then removed
  // by its tombstone — never resurrected the other way around.
  const flushMedia = useCallback(async () => {
    const s = session.current;
    if (!s || mediaFlushing.current) return;
    if (pendingMedia.current.size === 0 && pendingMediaDeletes.current.size === 0) return;
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
      for (const id of [...pendingMediaDeletes.current]) {
        await relay.deleteMedia(s.token, id); // idempotent on the relay
        pendingMediaDeletes.current.delete(id);
        if (dbReady.current) void db.clearMediaTombstone(id);
        syncPendingCount();
      }
    } catch (e) {
      // 503 = relay has no object store configured; recordings stay queued
      // locally without flapping the connection indicator to "offline".
      if (!(e instanceof RelayError && e.status === 503)) setStatusLive('offline');
    } finally {
      mediaFlushing.current = false;
    }
  }, [relay, db, syncPendingCount, setStatusLive]);

  const flush = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    if (
      pending.current.size === 0 &&
      pendingTemplates.current.size === 0 &&
      pendingInterviewTypes.current.size === 0
    ) {
      void flushMedia(); // no dirty records, but recordings may still be queued
      return;
    }
    const batch = [...pending.current.values()];
    const tplBatch = [...pendingTemplates.current.values()];
    const itvBatch = [...pendingInterviewTypes.current.values()];
    setSaving(true);
    try {
      const applied = await pushEntries(relay, s.token, s.identity.dataKey, batch);
      for (const id of applied) pending.current.delete(id);
      // Clear the dirty flag locally for exactly the versions the relay accepted.
      if (dbReady.current) void db.markSynced(batch.filter((e) => applied.has(e.id)));
      const appliedTpl = await pushTemplates(relay, s.token, s.identity.dataKey, tplBatch);
      for (const id of appliedTpl) pendingTemplates.current.delete(id);
      if (dbReady.current) void db.markTemplatesSynced(tplBatch.filter((t) => appliedTpl.has(t.id)));
      const appliedItv = await pushInterviewTypes(relay, s.token, s.identity.dataKey, itvBatch);
      for (const id of appliedItv) pendingInterviewTypes.current.delete(id);
      if (dbReady.current) void db.markInterviewTypesSynced(itvBatch.filter((t) => appliedItv.has(t.id)));
      syncPendingCount();
      setStatusLive('online');
    } catch {
      setStatusLive('offline');
    } finally {
      setSaving(false);
    }
    void flushMedia();
  }, [relay, db, syncPendingCount, flushMedia, setStatusLive]);

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
      if (res.templates.length) {
        if (dbReady.current) void db.mergeRemoteTemplates(res.templates);
        setTemplates((prev) => {
          const merged = mergeByLWW(prev, res.templates);
          // A synced copy of a built-in (someone edited or deleted it on another
          // device) retires this device's untouched seed of the same built-in —
          // the two carry different random ids, so LWW alone can't pair them.
          const syncedSlugs = new Set(res.templates.filter((t) => t.builtin).map((t) => t.builtin));
          const superseded = new Set(
            merged.filter((t) => t.pristine && t.builtin && syncedSlugs.has(t.builtin)).map((t) => t.id),
          );
          if (superseded.size === 0) return merged;
          if (dbReady.current) void db.dropTemplates([...superseded]);
          return merged.filter((t) => !superseded.has(t.id));
        });
      }
      if (res.interviewTypes.length) {
        if (dbReady.current) void db.mergeRemoteInterviewTypes(res.interviewTypes);
        setInterviewTypes((prev) => {
          const merged = mergeByLWW(prev, res.interviewTypes);
          // Same built-in supersede pass as templates: a synced copy of a built-in
          // retires this device's untouched seed of the same slug (different ids).
          const syncedSlugs = new Set(res.interviewTypes.filter((t) => t.builtin).map((t) => t.builtin));
          const superseded = new Set(
            merged.filter((t) => t.pristine && t.builtin && syncedSlugs.has(t.builtin)).map((t) => t.id),
          );
          if (superseded.size === 0) return merged;
          if (dbReady.current) void db.dropInterviewTypes([...superseded]);
          return merged.filter((t) => !superseded.has(t.id));
        });
      }
      setStatusLive('online');
    } catch {
      setStatusLive('offline');
    }
  }, [relay, db, setStatusLive]);

  // (Re)establish a relay session from the stored identity, then sync. `announce`
  // shows the "connecting…" state for a user-initiated attempt; background retries
  // stay quiet on "offline" until one succeeds, so the indicator doesn't flicker.
  const connect = useCallback(
    async (announce: boolean) => {
      const id = identity.current;
      if (!id) return;
      if (announce) setStatusLive('connecting');
      try {
        session.current = await authenticate(relay, id);
        cursor.current = 0;
        await flush();
        await pull();
        setStatusLive('online');
      } catch {
        // Local-first: identity is valid; the relay is just unreachable right now.
        setStatusLive('offline');
      }
    },
    [relay, flush, pull, setStatusLive],
  );

  // Shared tail of signIn and unlock: derive the identity from the seed, open
  // the per-owner DB, hydrate the UI, and kick off the first sync.
  const startSession = useCallback(
    async (seed: Uint8Array) => {
      const id = deriveIdentity(seed); // local, synchronous
      identity.current = id;
      setOwnerId(id.ownerId);
      // Restore the AI settings, if this vault sealed any on this device. A
      // record sealed by a different vault fails the AEAD tag → stays null.
      void loadAiSettingsRecord().then((rec) => {
        if (!rec || identity.current !== id) return;
        try {
          setAiSettings(openAiSettings(id.aiKey, rec));
        } catch {
          /* tampered or another vault's record — AI stays unconfigured */
        }
      });
      // Leave the lock screen immediately: loading the SQLite wasm and the
      // first relay sync take visible time — the app shell shows "connecting"
      // + the first-sync notice instead of freezing.
      setStatus('connecting');
      setBootstrapping(true);
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
        // Templates: first run on this device (no rows at all, tombstones
        // included) lays down the built-in seeds — pristine + non-dirty, so
        // they stay local until the user makes one their own.
        let localTpl = await db.allTemplates();
        if ((await db.templateCount()) === 0) {
          localTpl = seedBuiltinTemplates(Date.now());
          await db.seedTemplates(localTpl);
        }
        setTemplates(localTpl);
        // Interview types: same once-per-device built-in seeding as templates.
        let localItv = await db.allInterviewTypes();
        if ((await db.interviewTypeCount()) === 0) {
          localItv = seedBuiltinInterviews(Date.now());
          await db.seedInterviewTypes(localItv);
        }
        setInterviewTypes(localItv);
        // Journals: same once-per-device seeding (a tombstoned sample notebook
        // keeps its row, so deleting one sticks across unlocks).
        let localJournals = await db.allJournals();
        if ((await db.journalCount()) === 0) {
          localJournals = JOURNALS;
          await db.seedJournals(localJournals);
        }
        setJournals(localJournals);
        // Rebuild the outboxes from work left unsynced by a previous offline session.
        for (const e of await db.dirtyEntries()) pending.current.set(e.id, e);
        for (const t of await db.dirtyTemplates()) pendingTemplates.current.set(t.id, t);
        for (const t of await db.dirtyInterviewTypes()) pendingInterviewTypes.current.set(t.id, t);
        for (const m of await db.unsyncedMedia()) pendingMedia.current.set(m.id, m);
        for (const id of await db.mediaTombstones()) pendingMediaDeletes.current.add(id);
        syncPendingCount();
      } catch {
        // OPFS unavailable: run in-memory only (no persistence this session).
        dbReady.current = false;
        setEntries((prev) => (prev.length ? prev : seedEntries()));
        setTemplates((prev) => (prev.length ? prev : seedBuiltinTemplates(Date.now())));
        setInterviewTypes((prev) => (prev.length ? prev : seedBuiltinInterviews(Date.now())));
        setJournals((prev) => (prev.length ? prev : JOURNALS));
      }
      try {
        await connect(true);
      } finally {
        // First sync attempt is over (pulled, or definitively offline) — empty
        // journals now mean "empty", no longer "still arriving".
        setBootstrapping(false);
      }
    },
    [db, connect, syncPendingCount],
  );

  const signIn: AppData['signIn'] = useCallback(
    async (mnemonic, passphrase) => {
      const seed = mnemonicToSeed(mnemonic);
      if (passphrase) {
        try {
          // Seal first, while the onboarding screen still shows its busy state
          // (argon2idAsync yields, so the UI keeps painting).
          const sealed = await sealSeed(seed, passphrase);
          await storeSealedSeed(sealed.record);
          wrap.current = sealed.wrap;
          setHasVault(true);
        } catch {
          // Keystore unavailable — degrade to the nothing-persisted mode.
          wrap.current = null;
          setHasVault(false);
        }
      } else {
        // An explicit phrase entry without a passphrase replaces whatever
        // choice was stored before — possibly even a different account's seed.
        wrap.current = null;
        void clearSealedSeed();
        setHasVault(false);
      }
      await startSession(seed);
    },
    [startSession],
  );

  const unlock: AppData['unlock'] = useCallback(
    async (passphrase) => {
      const record = await loadSealedSeed();
      if (!record) {
        setHasVault(false);
        throw new Error('no sealed seed on this device');
      }
      const opened = await openSeed(record, passphrase); // throws on a wrong passphrase
      wrap.current = opened.wrap;
      await startSession(opened.seed);
    },
    [startSession],
  );

  const lock: AppData['lock'] = useCallback(() => {
    // Drop references rather than zeroing the key bytes: an in-flight flush
    // still holds them, and zeroing under a running encrypt would push garbage
    // ciphertext. setStatusLive keeps that straggler from re-opening the UI.
    session.current = null;
    identity.current = null;
    wrap.current = null;
    setOwnerId(null);
    cursor.current = 0;
    pending.current.clear();
    pendingTemplates.current.clear();
    pendingInterviewTypes.current.clear();
    pendingMedia.current.clear();
    pendingMediaDeletes.current.clear();
    if (dbReady.current) db.close();
    dbReady.current = false;
    setEntries([]);
    setTemplates([]);
    setInterviewTypes([]);
    setAiSettings(null); // the decrypted API key leaves memory with the keys
    setJournals([]);
    setPendingCount(0);
    setSaving(false);
    setBootstrapping(false);
    setStatus('locked');
  }, [db]);

  // §6 auto-lock on inactivity, armed while unlocked on a device with a sealed
  // seed (unlocking again is one passphrase away, and the outboxes are durable
  // in the local DB, so nothing pending is lost).
  useEffect(() => {
    if (status === 'locked' || !hasVault) return;
    let t = setTimeout(lock, AUTO_LOCK_MS);
    const bump = (): void => {
      clearTimeout(t);
      t = setTimeout(lock, AUTO_LOCK_MS);
    };
    const events = ['pointerdown', 'keydown'] as const;
    for (const ev of events) window.addEventListener(ev, bump, { passive: true });
    return () => {
      clearTimeout(t);
      for (const ev of events) window.removeEventListener(ev, bump);
    };
  }, [status, hasVault, lock]);

  const createEntry: AppData['createEntry'] = useCallback(
    (input) => {
      const now = Date.now();
      const entry: JournalEntry = {
        id: newEntryId(),
        journalId: input.journalId,
        title: input.title ?? defaultEntryTitle(now),
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

  const newJournal = useCallback(
    (j: Journal) => {
      setJournals((prev) => [...prev, j]);
      if (dbReady.current) void db.putJournal(j);
    },
    [db],
  );

  const updateJournal: AppData['updateJournal'] = useCallback(
    (id, patch) => {
      const cur = journals.find((j) => j.id === id);
      if (!cur) return;
      const updated = { ...cur, ...patch };
      setJournals((prev) => prev.map((j) => (j.id === id ? updated : j)));
      if (dbReady.current) void db.putJournal(updated);
    },
    [db, journals],
  );

  const createTemplate: AppData['createTemplate'] = useCallback(
    (input) => {
      const now = Date.now();
      const t: TemplateRecord = {
        id: newTemplateId(),
        name: input.name,
        bodyText: input.bodyText ?? '',
        bodyJson: input.bodyJson,
        createdAt: now,
        updatedAt: now,
      };
      setTemplates((prev) => mergeByLWW(prev, [t]));
      if (dbReady.current) void db.putLocalTemplate(t);
      pendingTemplates.current.set(t.id, t);
      syncPendingCount();
      void flush();
      return t;
    },
    [db, flush, syncPendingCount],
  );

  const updateTemplate: AppData['updateTemplate'] = useCallback(
    (id, patch) => {
      const now = Date.now();
      setTemplates((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur) return prev;
        // The first edit of a built-in seed turns it into a real synced record
        // (pristine is cleared); the builtin slug rides along so other devices
        // retire their own seed of it.
        const next: TemplateRecord = { ...cur, ...patch, pristine: false, updatedAt: now };
        if (dbReady.current) void db.putLocalTemplate(next);
        pendingTemplates.current.set(id, next);
        syncPendingCount();
        void flush();
        return mergeByLWW(prev, [next]);
      });
    },
    [db, flush, syncPendingCount],
  );

  const deleteTemplate: AppData['deleteTemplate'] = useCallback(
    (id) => {
      const now = Date.now();
      setTemplates((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur) return prev;
        // Tombstone rather than drop: the deletion must out-sync other devices'
        // copies — and, via the builtin slug, their pristine seeds too.
        const next: TemplateRecord = { ...cur, deleted: true, pristine: false, updatedAt: now };
        if (dbReady.current) void db.putLocalTemplate(next);
        pendingTemplates.current.set(id, next);
        syncPendingCount();
        void flush();
        return mergeByLWW(prev, [next]);
      });
    },
    [db, flush, syncPendingCount],
  );

  const createInterviewType: AppData['createInterviewType'] = useCallback(
    (input) => {
      const now = Date.now();
      const t: InterviewType = {
        id: newTemplateId(),
        name: input.name,
        intro: input.intro ?? '',
        prompt: input.prompt ?? '',
        createdAt: now,
        updatedAt: now,
      };
      setInterviewTypes((prev) => mergeByLWW(prev, [t]));
      if (dbReady.current) void db.putLocalInterviewType(t);
      pendingInterviewTypes.current.set(t.id, t);
      syncPendingCount();
      void flush();
      return t;
    },
    [db, flush, syncPendingCount],
  );

  const updateInterviewType: AppData['updateInterviewType'] = useCallback(
    (id, patch) => {
      const now = Date.now();
      setInterviewTypes((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur) return prev;
        // The first edit of a built-in seed turns it into a real synced record
        // (pristine cleared); the builtin slug rides along so other devices retire it.
        const next: InterviewType = { ...cur, ...patch, pristine: false, updatedAt: now };
        if (dbReady.current) void db.putLocalInterviewType(next);
        pendingInterviewTypes.current.set(id, next);
        syncPendingCount();
        void flush();
        return mergeByLWW(prev, [next]);
      });
    },
    [db, flush, syncPendingCount],
  );

  const deleteInterviewType: AppData['deleteInterviewType'] = useCallback(
    (id) => {
      const now = Date.now();
      setInterviewTypes((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur) return prev;
        // Tombstone (built-ins included) so the deletion out-syncs other devices'
        // copies — and, via the builtin slug, their pristine seeds too.
        const next: InterviewType = { ...cur, deleted: true, pristine: false, updatedAt: now };
        if (dbReady.current) void db.putLocalInterviewType(next);
        pendingInterviewTypes.current.set(id, next);
        syncPendingCount();
        void flush();
        return mergeByLWW(prev, [next]);
      });
    },
    [db, flush, syncPendingCount],
  );

  // Persist new AI settings sealed under the vault-derived key. The plaintext
  // (API key included) only ever lives in this state object while unlocked.
  const saveAiSettings: AppData['saveAiSettings'] = useCallback(async (s) => {
    const id = identity.current;
    if (!id) throw new Error('not signed in');
    if (s === null) {
      await clearAiSettingsRecord();
      setAiSettings(null);
      return;
    }
    await storeAiSettingsRecord(sealAiSettings(id.aiKey, s));
    setAiSettings(s);
  }, []);

  // Store a recording: bytes go to the local DB + media outbox. The attachment
  // metadata is returned for the editor to embed as an inline node in the entry
  // document (bodyJson), which rides inside the encrypted entry body — so other
  // devices learn the media id while the relay only ever sees that random id
  // and ciphertext chunks.
  const addMedia: AppData['addMedia'] = useCallback(
    async (entryId, kind, blob, meta) => {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (data.length === 0) return null;
      const now = Date.now();
      const fallbackMime =
        kind === 'audio' ? 'audio/webm' : kind === 'video' ? 'video/webm' : kind === 'image' ? 'image/jpeg' : 'application/octet-stream';
      const att: MediaAttachment = {
        id: newMediaId(),
        kind,
        mime: blob.type || fallbackMime,
        bytes: data.length,
        durationMs: meta?.durationMs,
        name: meta?.name,
        width: meta?.width,
        height: meta?.height,
        createdAt: now,
      };
      const rec: MediaRecord = {
        id: att.id,
        entryId,
        mime: att.mime,
        bytes: att.bytes,
        durationMs: meta?.durationMs,
        createdAt: now,
        data,
        synced: false,
      };
      if (dbReady.current) void db.putMedia(rec);
      pendingMedia.current.set(rec.id, rec);
      syncPendingCount();
      void flush();
      return att;
    },
    [db, flush, syncPendingCount],
  );

  // Permanent deletion (the caller has already removed the entry's reference
  // and shown the "cannot be undone" confirmation): purge the local bytes and
  // queue the relay-side delete (DELETE /v1/media/{id}). The tombstone persists
  // until the relay acknowledges, so deletes made offline still happen later.
  const removeMedia: AppData['removeMedia'] = useCallback(
    (mediaId) => {
      pendingMedia.current.delete(mediaId);
      pendingMediaDeletes.current.add(mediaId);
      if (dbReady.current) {
        void db.deleteMedia(mediaId).catch(() => undefined);
        void db.addMediaTombstone(mediaId).catch(() => undefined);
      }
      syncPendingCount();
      void flushMedia(); // reach the relay now if we're online
    },
    [db, syncPendingCount, flushMedia],
  );

  // Tombstone an entry (the caller has shown the confirmation). The tombstone
  // row keeps winning LWW against stale copies and pushes like any edit, so the
  // deletion reaches every device; the entry's recordings — inline nodes and
  // legacy attachments alike — go through the same confirmed-delete path as a
  // single recording (local purge + relay DELETE).
  const deleteEntry: AppData['deleteEntry'] = useCallback(
    (id) => {
      const now = Date.now();
      let victim: JournalEntry | undefined;
      setEntries((prev) => {
        const cur = prev.find((e) => e.id === id);
        if (!cur || cur.deleted) return prev;
        victim = cur;
        const next: JournalEntry = { ...cur, deleted: true, updatedAt: now };
        if (dbReady.current) void db.putLocal(next);
        pending.current.set(id, next);
        return mergeByLWW(prev, [next]);
      });
      if (!victim) return;
      const mediaIds = new Set((victim.attachments ?? []).map((a) => a.id));
      if (victim.bodyJson) {
        try {
          for (const m of docMediaIds(JSON.parse(victim.bodyJson) as JSONContent)) mediaIds.add(m);
        } catch {
          /* unparseable body — nothing to collect */
        }
      }
      for (const m of mediaIds) removeMedia(m);
      syncPendingCount();
      void flush();
    },
    [db, flush, syncPendingCount, removeMedia],
  );

  // Delete a whole notebook (the caller has shown the typed-"delete" sheet).
  // Every entry in it tombstones like a single entry delete — one batch, one
  // flush — and the journal row itself is dropped locally (it never synced).
  const deleteJournal: AppData['deleteJournal'] = useCallback(
    (id) => {
      const now = Date.now();
      const mediaIds = new Set<string>();
      setEntries((prev) => {
        const victims = prev.filter((e) => e.journalId === id && !e.deleted);
        if (victims.length === 0) return prev;
        const tombstones = victims.map((e): JournalEntry => ({ ...e, deleted: true, updatedAt: now }));
        for (const e of tombstones) {
          if (dbReady.current) void db.putLocal(e);
          pending.current.set(e.id, e);
        }
        for (const v of victims) {
          for (const a of v.attachments ?? []) mediaIds.add(a.id);
          if (v.bodyJson) {
            try {
              for (const m of docMediaIds(JSON.parse(v.bodyJson) as JSONContent)) mediaIds.add(m);
            } catch {
              /* unparseable body — nothing to collect */
            }
          }
        }
        return mergeByLWW(prev, tombstones);
      });
      for (const m of mediaIds) removeMedia(m);
      setJournals((prev) => prev.filter((j) => j.id !== id));
      if (dbReady.current) void db.deleteJournal(id);
      syncPendingCount();
      void flush();
    },
    [db, flush, syncPendingCount, removeMedia],
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

  // Small list thumbnail for an image: cached downscaled JPEG → generate from the
  // full bytes once → persist. Keeps the overview lists from decoding full-res
  // images into the DOM. Non-images have no preview; the editor uses mediaBlob.
  const mediaThumb: AppData['mediaThumb'] = useCallback(
    async (entryId, att) => {
      if (att.kind !== 'image') return null;
      if (dbReady.current) {
        const cached = await db.getMediaThumb(att.id).catch(() => null);
        if (cached) return bytesToBlob(cached, 'image/jpeg');
      }
      const full = await mediaBlob(entryId, att);
      if (!full) return null;
      try {
        const thumb = await makeThumbnail(full);
        if (dbReady.current) {
          const bytes = new Uint8Array(await thumb.arrayBuffer());
          void db.putMediaThumb(att.id, bytes).catch(() => undefined);
        }
        return thumb;
      } catch {
        return full; // unsupported format — fall back to the original bytes
      }
    },
    [db, mediaBlob],
  );

  // Replace the recovery phrase (sync/rotate.ts). The rotation sheet blocks edits
  // while this runs; flipping to 'connecting' first tears down the background
  // interval so no flush/pull races the migration against the old account.
  const rotatePhrase: AppData['rotatePhrase'] = useCallback(
    async (newMnemonic, onProgress) => {
      const s = session.current;
      if (!s) throw new Error('not signed in');
      setStatus('connecting');
      try {
        const oldOwnerId = s.ownerId;
        const localMedia = dbReady.current
          ? await db.allMedia().catch(() => [...pendingMedia.current.values()])
          : [...pendingMedia.current.values()];
        const mediaById = new Map(localMedia.map((m) => [m.id, m]));

        const result = await rotateAccount({
          relay,
          old: s,
          newMnemonic,
          localDirty: [...pending.current.values()],
          localDirtyTemplates: [...pendingTemplates.current.values()],
          localDirtyInterviewTypes: [...pendingInterviewTypes.current.values()],
          localMediaBytes: (id) => Promise.resolve(mediaById.get(id)?.data ?? null),
          onProgress,
        });

        // The vault now lives under the new owner: swap the in-memory identity.
        identity.current = result.session.identity;
        session.current = result.session;
        setOwnerId(result.session.ownerId);
        cursor.current = 0;
        pending.current.clear();
        pendingTemplates.current.clear();
        pendingInterviewTypes.current.clear();
        pendingMedia.current.clear();

        // Everything the relay holds lands non-dirty; local-only rows (e.g. the
        // sample timeline and pristine template/interview seeds) move across unchanged.
        const all = mergeByLWW(entries, result.entries);
        const allTpl = mergeByLWW(templates, result.templates);
        const allItv = mergeByLWW(interviewTypes, result.interviewTypes);

        // Re-home the local DB under the new owner_id, then destroy the old
        // per-owner directory — it holds plaintext under a possibly-leaked identity.
        if (dbReady.current) {
          db.close();
          try {
            await db.open(result.session.ownerId);
            await db.mergeRemote(all);
            // Seeds keep their pristine/local-only standing; everything else
            // is on the new relay account already, so it lands non-dirty.
            await db.seedTemplates(allTpl.filter((t) => t.pristine));
            await db.mergeRemoteTemplates(allTpl.filter((t) => !t.pristine));
            await db.seedInterviewTypes(allItv.filter((t) => t.pristine));
            await db.mergeRemoteInterviewTypes(allItv.filter((t) => !t.pristine));
            // Journals are local-only — carry the current set into the new DB
            // (marked as seeded, so the samples don't re-appear on top).
            await db.seedJournals(journals);
          } catch {
            dbReady.current = false;
          }
          void destroyOwnerDb(oldOwnerId);
        }
        for (const m of localMedia) {
          const rec: MediaRecord = { ...m, synced: result.uploadedMedia.has(m.id) };
          if (dbReady.current) void db.putMedia(rec);
          // Recordings the relay couldn't take (e.g. no object store) re-enter
          // the outbox and upload to the new account when it becomes possible.
          if (!rec.synced && rec.data) pendingMedia.current.set(rec.id, rec);
        }

        // Keep the at-rest seal in step with the vault: same passphrase (same
        // wrap key + salt), new seed. Left alone, the stored record would
        // "unlock" into the old identity — wiped on the relay and with its
        // local DB destroyed below. If re-sealing fails, clear it instead:
        // a lying vault is worse than no vault.
        if (wrap.current) {
          try {
            await storeSealedSeed(sealWithKey(wrap.current, mnemonicToSeed(newMnemonic)));
          } catch {
            wrap.current = null;
            void clearSealedSeed();
            setHasVault(false);
          }
        }

        // Same for the sealed AI settings: their wrap key derives from the seed,
        // so the old record would no longer open. Re-seal under the new identity;
        // on failure, clear — AI falls back to "not configured".
        if (aiSettings) {
          try {
            await storeAiSettingsRecord(sealAiSettings(result.session.identity.aiKey, aiSettings));
          } catch {
            void clearAiSettingsRecord();
            setAiSettings(null);
          }
        }

        setEntries(all);
        setTemplates(allTpl);
        setInterviewTypes(allItv);
        syncPendingCount();
        setStatus('online'); // re-arms the background loop against the new account
      } catch (e) {
        // Failed before the wipe: the old account is intact. The reconnect loop
        // re-authenticates the (unchanged) identity on its own.
        setStatus('offline');
        throw e;
      }
    },
    [relay, db, entries, templates, interviewTypes, journals, aiSettings, syncPendingCount],
  );

  // Permanently delete the vault. Relay first — only after the server confirms
  // does this device erase itself, so a failed request leaves everything intact.
  const deleteVault: AppData['deleteVault'] = useCallback(async () => {
    const s = session.current;
    if (!s) throw new Error('not signed in');
    // Tear down the background loop so no flush/pull races the wipe.
    setStatus('connecting');
    try {
      await relay.deleteAccount(s.token);
    } catch (e) {
      // Account intact — drop to offline so the reconnect loop resumes normally.
      setStatus('offline');
      throw e;
    }
    // Point of no return: the relay copy is gone. Erase this device too — the
    // plaintext per-owner DB and any sealed seed (a seal that "unlocks" into a
    // deleted account would be a lying vault).
    if (dbReady.current) {
      db.close();
      dbReady.current = false;
    }
    void destroyOwnerDb(s.ownerId);
    wrap.current = null;
    void clearSealedSeed();
    void clearAiSettingsRecord(); // the sealed API key must not survive the vault
    setHasVault(false);
    lock(); // drops the in-memory identity and lands on onboarding
  }, [relay, db, lock]);

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

  // Tombstones stay in the raw list (so LWW keeps winning against stale copies
  // and the outbox can push them) but every consumer sees only live entries.
  const liveEntries = useMemo(() => entries.filter((e) => !e.deleted), [entries]);

  const value: AppData = { status, hasVault, ownerId, pendingCount, pendingJournalIds, saving, bootstrapping, entries: liveEntries, journals: journalsWithCounts, templates, interviewTypes, aiSettings, saveAiSettings, signIn, unlock, lock, createEntry, updateEntry, deleteEntry, newJournal, updateJournal, deleteJournal, createTemplate, updateTemplate, deleteTemplate, createInterviewType, updateInterviewType, deleteInterviewType, addMedia, removeMedia, mediaBlob, mediaThumb, rotatePhrase, deleteVault };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
