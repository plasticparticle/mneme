// Entry encryption + relay push/pull. The synced unit is a JournalEntry: its
// body is JSON-serialized, encrypted with the data key, and stored as an opaque
// blob. lww_clock = updatedAt (ms) — last-write-wins per entry (§3).
import { encrypt, decrypt } from '../crypto/aead';
import { utf8, fromUtf8 } from '../crypto/bytes';
import { toBase64, fromBase64 } from '../crypto/base64';
import type { PushEntry, RelayClient } from './relay';

// One media object attached to an entry. This metadata travels INSIDE the
// encrypted entry body — the relay sees only the random media id and the
// ciphertext chunk sizes, never mime/duration/size-of-plaintext (§3).
export interface MediaAttachment {
  id: string; // random 128-bit hex (newMediaId) — never date-encoded (§3)
  kind: 'video' | 'audio';
  mime: string;
  bytes: number; // plaintext size
  durationMs?: number;
  createdAt: number;
}

export interface JournalEntry {
  id: string;
  journalId: string;
  title: string;
  bodyText: string;
  bodyJson?: string; // TipTap/ProseMirror document JSON (the rich source of truth)
  labels: string[];
  attachments?: MediaAttachment[];
  createdAt: number; // ms
  updatedAt: number; // ms — also the lww_clock
  deleted?: boolean;
}

// An entry template (§10 step 7, private only). Templates sync through the same
// oplog as entries: the record type lives INSIDE the ciphertext (`kind` below),
// so the relay cannot tell a template blob from an entry blob.
export interface TemplateRecord {
  id: string; // random 128-bit hex (newTemplateId) — never date-encoded (§3)
  name: string;
  bodyText: string;
  bodyJson?: string; // TipTap/ProseMirror document JSON
  /**
   * Built-in slug ('daily', 'gratitude', …) for templates that started life as a
   * predefined seed. Survives edits and tombstones so other devices can retire
   * their own untouched seed of the same built-in (they have different ids).
   */
  builtin?: string;
  /** Local-only: an untouched built-in seed. Never serialized; cleared on first edit. */
  pristine?: boolean;
  createdAt: number; // ms
  updatedAt: number; // ms — also the lww_clock
  deleted?: boolean;
}

// What actually gets encrypted (everything except the cleartext id/clock/deleted flag).
// `kind` is absent on entries (the original wire shape) and 'template' on templates;
// decoding routes on it, so pre-template blobs keep decoding as entries.
interface EntryBody {
  kind?: undefined;
  journalId: string;
  title: string;
  bodyText: string;
  bodyJson?: string;
  labels: string[];
  attachments?: MediaAttachment[];
  createdAt: number;
  updatedAt: number;
}

interface TemplateBody {
  kind: 'template';
  name: string;
  bodyText: string;
  bodyJson?: string;
  builtin?: string;
  createdAt: number;
  updatedAt: number;
}

type RecordBody = EntryBody | TemplateBody;

export function encryptEntry(dataKey: Uint8Array, e: JournalEntry): Uint8Array {
  const body: EntryBody = {
    journalId: e.journalId,
    title: e.title,
    bodyText: e.bodyText,
    bodyJson: e.bodyJson,
    labels: e.labels,
    attachments: e.attachments,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
  return encrypt(dataKey, utf8(JSON.stringify(body)));
}

export function toPushEntry(dataKey: Uint8Array, e: JournalEntry): PushEntry {
  return {
    entry_id: e.id,
    lww_clock: e.updatedAt,
    ciphertext: toBase64(encryptEntry(dataKey, e)),
    deleted: e.deleted ?? false,
  };
}

/** Push entries; returns the set of entry ids the relay accepted (newer than stored). */
export async function pushEntries(
  relay: RelayClient,
  token: string,
  dataKey: Uint8Array,
  entries: JournalEntry[],
): Promise<Set<string>> {
  if (entries.length === 0) return new Set();
  const resp = await relay.push(token, entries.map((e) => toPushEntry(dataKey, e)));
  return new Set(resp.results.filter((r) => r.applied).map((r) => r.entry_id));
}

export function toPushTemplate(dataKey: Uint8Array, t: TemplateRecord): PushEntry {
  const body: TemplateBody = {
    kind: 'template',
    name: t.name,
    bodyText: t.bodyText,
    bodyJson: t.bodyJson,
    builtin: t.builtin,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  return {
    entry_id: t.id,
    lww_clock: t.updatedAt,
    ciphertext: toBase64(encrypt(dataKey, utf8(JSON.stringify(body)))),
    deleted: t.deleted ?? false,
  };
}

/** Push templates through the same oplog; returns the accepted template ids. */
export async function pushTemplates(
  relay: RelayClient,
  token: string,
  dataKey: Uint8Array,
  templates: TemplateRecord[],
): Promise<Set<string>> {
  if (templates.length === 0) return new Set();
  const resp = await relay.push(token, templates.map((t) => toPushTemplate(dataKey, t)));
  return new Set(resp.results.filter((r) => r.applied).map((r) => r.entry_id));
}

export interface PullResult {
  entries: JournalEntry[];
  templates: TemplateRecord[];
  cursor: number;
  more: boolean;
}

/** Pull changes since the cursor, decrypt, and route each record by its kind. */
export async function pullEntries(
  relay: RelayClient,
  token: string,
  dataKey: Uint8Array,
  since: number,
): Promise<PullResult> {
  const resp = await relay.pull(token, since);
  const entries: JournalEntry[] = [];
  const templates: TemplateRecord[] = [];
  for (const item of resp.entries) {
    const body = JSON.parse(fromUtf8(decrypt(dataKey, fromBase64(item.ciphertext)))) as RecordBody;
    if (body.kind === 'template') {
      templates.push({
        id: item.entry_id,
        name: body.name,
        bodyText: body.bodyText,
        bodyJson: body.bodyJson,
        builtin: body.builtin,
        createdAt: body.createdAt,
        updatedAt: body.updatedAt,
        deleted: item.deleted,
      });
    } else {
      entries.push({
        id: item.entry_id,
        journalId: body.journalId,
        title: body.title,
        bodyText: body.bodyText,
        bodyJson: body.bodyJson,
        labels: body.labels ?? [],
        attachments: body.attachments,
        createdAt: body.createdAt,
        updatedAt: body.updatedAt,
        deleted: item.deleted,
      });
    }
  }
  return { entries, templates, cursor: resp.cursor, more: resp.more };
}
