// Chunked media encryption (CLAUDE.md §6): plaintext is split into ~1 MiB chunks
// and each chunk is sealed independently with the media key — its own random
// nonce, the standard [version:1B][nonce:24B][ct+tag] framing. Chunks travel and
// land in object storage one by one (PUT /v1/media/{id}/chunks/{n}), so a device
// can fetch/retry per chunk without re-downloading the whole recording.
//
// Each chunk's AAD binds it to its media id and position (`media:<id>:<i>/<n>`),
// so a relay that reorders, swaps, drops or cross-splices chunks produces blobs
// that simply fail to decrypt. The AAD is never transmitted — both sides re-derive it.
import { encrypt, decrypt } from './aead';
import { utf8 } from './bytes';

/** Plaintext bytes per chunk. Ciphertext adds 41 bytes of framing per chunk. */
export const MEDIA_CHUNK_BYTES = 1 << 20;

function chunkAad(mediaId: string, index: number, total: number): Uint8Array {
  return utf8(`media:${mediaId}:${index}/${total}`);
}

/** Encrypt a media payload into ordered ciphertext chunks (always at least one). */
export function encryptMediaChunks(mediaKey: Uint8Array, mediaId: string, data: Uint8Array): Uint8Array[] {
  const total = Math.max(1, Math.ceil(data.length / MEDIA_CHUNK_BYTES));
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const plain = data.subarray(i * MEDIA_CHUNK_BYTES, (i + 1) * MEDIA_CHUNK_BYTES);
    chunks.push(encrypt(mediaKey, plain, chunkAad(mediaId, i, total)));
  }
  return chunks;
}

/** Decrypt ordered ciphertext chunks back into the media payload. */
export function decryptMediaChunks(mediaKey: Uint8Array, mediaId: string, chunks: Uint8Array[]): Uint8Array {
  const parts = chunks.map((c, i) => decrypt(mediaKey, c, chunkAad(mediaId, i, chunks.length)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
