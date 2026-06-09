// Entry encryption + relay push/pull. The synced unit is a JournalEntry: its
// body is JSON-serialized, encrypted with the data key, and stored as an opaque
// blob. lww_clock = updatedAt (ms) — last-write-wins per entry (§3).
import { encrypt, decrypt } from '../crypto/aead';
import { utf8, fromUtf8 } from '../crypto/bytes';
import { toBase64, fromBase64 } from '../crypto/base64';
import type { PushEntry, RelayClient } from './relay';

export interface JournalEntry {
  id: string;
  journalId: string;
  title: string;
  bodyText: string;
  labels: string[];
  createdAt: number; // ms
  updatedAt: number; // ms — also the lww_clock
  deleted?: boolean;
}

// What actually gets encrypted (everything except the cleartext id/clock/deleted flag).
interface EntryBody {
  journalId: string;
  title: string;
  bodyText: string;
  labels: string[];
  createdAt: number;
  updatedAt: number;
}

export function encryptEntry(dataKey: Uint8Array, e: JournalEntry): Uint8Array {
  const body: EntryBody = {
    journalId: e.journalId,
    title: e.title,
    bodyText: e.bodyText,
    labels: e.labels,
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

export interface PullResult {
  entries: JournalEntry[];
  cursor: number;
  more: boolean;
}

/** Pull changes since the cursor and decrypt them into JournalEntries. */
export async function pullEntries(
  relay: RelayClient,
  token: string,
  dataKey: Uint8Array,
  since: number,
): Promise<PullResult> {
  const resp = await relay.pull(token, since);
  const entries: JournalEntry[] = resp.entries.map((item) => {
    const body = JSON.parse(fromUtf8(decrypt(dataKey, fromBase64(item.ciphertext)))) as EntryBody;
    return {
      id: item.entry_id,
      journalId: body.journalId,
      title: body.title,
      bodyText: body.bodyText,
      labels: body.labels ?? [],
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      deleted: item.deleted,
    };
  });
  return { entries, cursor: resp.cursor, more: resp.more };
}
