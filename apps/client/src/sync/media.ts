// Media transfer orchestration: chunked encryption (crypto/media.ts) over the
// relay's per-chunk endpoints (§10 step 5, server-relayed — see server
// internal/blobs). The relay stores opaque ciphertext chunks; which entry a
// media object belongs to, its mime type, and its duration live only inside
// the encrypted entry body (sync/engine.ts MediaAttachment).
import { encryptMediaChunks, decryptMediaChunks } from '../crypto/media';
import type { RelayClient } from './relay';

/** Encrypt + upload one media payload, then finalize it for other devices. */
export async function uploadMedia(
  relay: RelayClient,
  token: string,
  mediaKey: Uint8Array,
  mediaId: string,
  data: Uint8Array,
): Promise<void> {
  const chunks = encryptMediaChunks(mediaKey, mediaId, data);
  let bytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    await relay.uploadMediaChunk(token, mediaId, i, chunks[i]);
    bytes += chunks[i].length;
  }
  await relay.completeMedia(token, mediaId, chunks.length, bytes);
}

/** Download + decrypt one finalized media payload. */
export async function downloadMedia(
  relay: RelayClient,
  token: string,
  mediaKey: Uint8Array,
  mediaId: string,
): Promise<Uint8Array> {
  const meta = await relay.mediaMeta(token, mediaId);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    chunks.push(await relay.downloadMediaChunk(token, mediaId, i));
  }
  return decryptMediaChunks(mediaKey, mediaId, chunks);
}
