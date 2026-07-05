// Recovery-phrase rotation — the "my phrase may have leaked" escape hatch.
//
// A BIP39 phrase cannot be changed in place: owner_id, the data key and the
// media key are all derived from it (§6). Rotation therefore means deriving a
// fresh identity from a NEW phrase, re-encrypting the whole vault under it,
// pushing it as a brand-new owner, and finally deleting the old owner from the
// relay so the leaked phrase unlocks nothing — not even ciphertext.
//
// Ordering is the safety property: the old account is wiped only after every
// entry and every reachable media object is stored under the new one. Any
// failure before the wipe leaves the old account fully intact, and re-running
// rotation with the same new phrase is safe (pushes are LWW-idempotent).
import type { JSONContent } from '@tiptap/core';
import { authenticate, identityFromMnemonic, type Session } from './identity';
import {
  pushEntries,
  pushTemplates,
  pushInterviewTypes,
  pushJournals,
  pushAiSettings,
  pullEntries,
  type JournalEntry,
  type TemplateRecord,
  type InterviewType,
  type JournalRecord,
  type AiSettingsRecord,
} from './engine';
import { uploadMedia, downloadMedia } from './media';
import { RelayError, type RelayClient } from './relay';
import { docMediaIds } from '../editor/doc';

export interface RotationProgress {
  phase: 'pull' | 'entries' | 'media' | 'wipe';
  done: number;
  total: number;
}

export interface RotationInput {
  relay: RelayClient;
  /** Authenticated session for the CURRENT (possibly leaked) phrase. */
  old: Session;
  /** The freshly generated replacement phrase. */
  newMnemonic: string;
  /** Local outbox entries that may never have reached the relay. */
  localDirty?: JournalEntry[];
  /** Local outbox templates that may never have reached the relay. */
  localDirtyTemplates?: TemplateRecord[];
  /** Local outbox interview types that may never have reached the relay. */
  localDirtyInterviewTypes?: InterviewType[];
  /** Local outbox journals that may never have reached the relay. */
  localDirtyJournals?: JournalRecord[];
  /** The local AI-settings record when it still waits in the outbox. */
  localDirtyAiSettings?: AiSettingsRecord;
  /** Plaintext media bytes from local storage; null when this device lacks them. */
  localMediaBytes?: (mediaId: string) => Promise<Uint8Array | null>;
  onProgress?: (p: RotationProgress) => void;
}

export interface RotationResult {
  /** Authenticated session under the new phrase. */
  session: Session;
  /** Everything (tombstones included) now stored under the new owner. */
  entries: JournalEntry[];
  /** Every synced template (tombstones included) now stored under the new owner. */
  templates: TemplateRecord[];
  /** Every synced interview type (tombstones included) now stored under the new owner. */
  interviewTypes: InterviewType[];
  /** Every synced journal record (tombstones included) now stored under the new owner. */
  journals: JournalRecord[];
  /** Every synced AI-settings record now stored under the new owner. */
  aiSettings: AiSettingsRecord[];
  /** Media fully re-uploaded under the new media key. */
  uploadedMedia: Set<string>;
  /** Media whose bytes stayed local-only (relay without object storage) or were unreachable. */
  skippedMedia: string[];
}

const PUSH_BATCH = 200;

export async function rotateAccount(input: RotationInput): Promise<RotationResult> {
  const { relay, old, onProgress } = input;
  const next = identityFromMnemonic(input.newMnemonic);
  if (next.ownerId === old.ownerId) throw new Error('the new phrase derives the same account');

  // 1. Drain the old account completely. Tombstones are migrated too, so
  //    deletions keep propagating to devices that re-sync after the rotation.
  const byId = new Map<string, JournalEntry>();
  const tplById = new Map<string, TemplateRecord>();
  const itvById = new Map<string, InterviewType>();
  // Journal + AI-settings records key on their WIRE record id — several records
  // may describe the same journal (or the settings singleton); the set is
  // re-pushed as-is so receivers' LWW-by-updatedAt keeps working unchanged.
  const jrnByRecord = new Map<string, JournalRecord>();
  const aiByRecord = new Map<string, AiSettingsRecord>();
  let cursor = 0;
  for (;;) {
    const res = await pullEntries(relay, old.token, old.identity.dataKey, cursor);
    for (const e of res.entries) byId.set(e.id, e);
    for (const t of res.templates) tplById.set(t.id, t);
    for (const t of res.interviewTypes) itvById.set(t.id, t);
    for (const j of res.journals) if (j.recordId) jrnByRecord.set(j.recordId, j);
    for (const a of res.aiSettings) aiByRecord.set(a.recordId, a);
    cursor = res.cursor;
    const pulled = byId.size + tplById.size + itvById.size + jrnByRecord.size + aiByRecord.size;
    onProgress?.({ phase: 'pull', done: pulled, total: pulled });
    if (!res.more) break;
  }
  for (const e of input.localDirty ?? []) {
    const cur = byId.get(e.id);
    if (!cur || e.updatedAt > cur.updatedAt) byId.set(e.id, e);
  }
  for (const t of input.localDirtyTemplates ?? []) {
    const cur = tplById.get(t.id);
    if (!cur || t.updatedAt > cur.updatedAt) tplById.set(t.id, t);
  }
  for (const t of input.localDirtyInterviewTypes ?? []) {
    const cur = itvById.get(t.id);
    if (!cur || t.updatedAt > cur.updatedAt) itvById.set(t.id, t);
  }
  for (const j of input.localDirtyJournals ?? []) {
    if (!j.recordId) continue;
    const cur = jrnByRecord.get(j.recordId);
    if (!cur || j.updatedAt > cur.updatedAt) jrnByRecord.set(j.recordId, j);
  }
  if (input.localDirtyAiSettings) {
    const a = input.localDirtyAiSettings;
    const cur = aiByRecord.get(a.recordId);
    if (!cur || a.updatedAt > cur.updatedAt) aiByRecord.set(a.recordId, a);
  }
  const entries = [...byId.values()];
  const templates = [...tplById.values()];
  const interviewTypes = [...itvById.values()];
  const journals = [...jrnByRecord.values()];
  const aiSettings = [...aiByRecord.values()];

  // 2. Open the new account (TOFU registration + challenge-response).
  const session = await authenticate(relay, next);

  // 3. Re-encrypt every entry and template under the new data key and push in
  //    batches. Both record kinds count toward the same progress total.
  const recordTotal = entries.length + templates.length + interviewTypes.length + journals.length + aiSettings.length;
  for (let i = 0; i < entries.length; i += PUSH_BATCH) {
    await pushEntries(relay, session.token, next.dataKey, entries.slice(i, i + PUSH_BATCH));
    onProgress?.({ phase: 'entries', done: Math.min(i + PUSH_BATCH, entries.length), total: recordTotal });
  }
  for (let i = 0; i < templates.length; i += PUSH_BATCH) {
    await pushTemplates(relay, session.token, next.dataKey, templates.slice(i, i + PUSH_BATCH));
    onProgress?.({ phase: 'entries', done: entries.length + Math.min(i + PUSH_BATCH, templates.length), total: recordTotal });
  }
  for (let i = 0; i < interviewTypes.length; i += PUSH_BATCH) {
    await pushInterviewTypes(relay, session.token, next.dataKey, interviewTypes.slice(i, i + PUSH_BATCH));
    onProgress?.({
      phase: 'entries',
      done: entries.length + templates.length + Math.min(i + PUSH_BATCH, interviewTypes.length),
      total: recordTotal,
    });
  }
  let migratedRecords = entries.length + templates.length + interviewTypes.length;
  for (let i = 0; i < journals.length; i += PUSH_BATCH) {
    await pushJournals(relay, session.token, next.dataKey, journals.slice(i, i + PUSH_BATCH));
    onProgress?.({ phase: 'entries', done: migratedRecords + Math.min(i + PUSH_BATCH, journals.length), total: recordTotal });
  }
  migratedRecords += journals.length;
  for (const a of aiSettings) {
    await pushAiSettings(relay, session.token, next.dataKey, a);
    onProgress?.({ phase: 'entries', done: ++migratedRecords, total: recordTotal });
  }

  // 4. Re-encrypt media under the new media key. Bytes come from local storage
  //    first, then from the old account. 404/503 on download means no one holds
  //    those bytes remotely — skip rather than block the rotation forever; 503
  //    on upload means the relay has no object store, so the bytes stay local
  //    and re-upload through the normal outbox later.
  const mediaIds: string[] = [];
  const seen = new Set<string>();
  const collect = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      mediaIds.push(id);
    }
  };
  for (const e of entries) {
    if (e.deleted) continue;
    // Legacy attachments-array media AND inline media nodes (recordings,
    // images, files, galleries) — the latter reference their ids in bodyJson.
    for (const a of e.attachments ?? []) collect(a.id);
    if (e.bodyJson) {
      try {
        for (const id of docMediaIds(JSON.parse(e.bodyJson) as JSONContent)) collect(id);
      } catch {
        /* unparseable body — nothing inline to carry over */
      }
    }
  }

  const uploadedMedia = new Set<string>();
  const skippedMedia: string[] = [];
  let migrated = 0;
  for (const id of mediaIds) {
    let data = (await input.localMediaBytes?.(id)) ?? null;
    if (!data) {
      try {
        data = await downloadMedia(relay, old.token, old.identity.mediaKey, id);
      } catch (e) {
        if (!(e instanceof RelayError && (e.status === 404 || e.status === 503))) throw e;
      }
    }
    if (data) {
      try {
        await uploadMedia(relay, session.token, next.mediaKey, id, data);
        uploadedMedia.add(id);
      } catch (e) {
        if (!(e instanceof RelayError && e.status === 503)) throw e;
        skippedMedia.push(id);
      }
    } else {
      skippedMedia.push(id);
    }
    onProgress?.({ phase: 'media', done: ++migrated, total: mediaIds.length });
  }

  // 5. Point of no return: the vault lives under the new owner — delete the old
  //    one so the (possibly leaked) phrase authenticates into nothing.
  onProgress?.({ phase: 'wipe', done: 0, total: 1 });
  await relay.deleteAccount(old.token);
  onProgress?.({ phase: 'wipe', done: 1, total: 1 });

  return { session, entries, templates, interviewTypes, journals, aiSettings, uploadedMedia, skippedMedia };
}
