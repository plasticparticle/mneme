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
import { authenticate, identityFromMnemonic, type Session } from './identity';
import { pushEntries, pullEntries, type JournalEntry } from './engine';
import { uploadMedia, downloadMedia } from './media';
import { RelayError, type RelayClient } from './relay';

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
  /** Plaintext media bytes from local storage; null when this device lacks them. */
  localMediaBytes?: (mediaId: string) => Promise<Uint8Array | null>;
  onProgress?: (p: RotationProgress) => void;
}

export interface RotationResult {
  /** Authenticated session under the new phrase. */
  session: Session;
  /** Everything (tombstones included) now stored under the new owner. */
  entries: JournalEntry[];
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
  let cursor = 0;
  for (;;) {
    const res = await pullEntries(relay, old.token, old.identity.dataKey, cursor);
    for (const e of res.entries) byId.set(e.id, e);
    cursor = res.cursor;
    onProgress?.({ phase: 'pull', done: byId.size, total: byId.size });
    if (!res.more) break;
  }
  for (const e of input.localDirty ?? []) {
    const cur = byId.get(e.id);
    if (!cur || e.updatedAt > cur.updatedAt) byId.set(e.id, e);
  }
  const entries = [...byId.values()];

  // 2. Open the new account (TOFU registration + challenge-response).
  const session = await authenticate(relay, next);

  // 3. Re-encrypt every entry under the new data key and push in batches.
  for (let i = 0; i < entries.length; i += PUSH_BATCH) {
    await pushEntries(relay, session.token, next.dataKey, entries.slice(i, i + PUSH_BATCH));
    onProgress?.({ phase: 'entries', done: Math.min(i + PUSH_BATCH, entries.length), total: entries.length });
  }

  // 4. Re-encrypt media under the new media key. Bytes come from local storage
  //    first, then from the old account. 404/503 on download means no one holds
  //    those bytes remotely — skip rather than block the rotation forever; 503
  //    on upload means the relay has no object store, so the bytes stay local
  //    and re-upload through the normal outbox later.
  const mediaIds: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.deleted) continue;
    for (const a of e.attachments ?? []) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        mediaIds.push(a.id);
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

  return { session, entries, uploadedMedia, skippedMedia };
}
