// Base64 helpers. Uses global btoa/atob (present in browsers and Node 18+),
// so the same code runs in the app and in Node integration tests.

function bytesToBinary(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function binaryToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Standard base64 (with padding) — used for wire fields the relay reads as Go StdEncoding. */
export function toBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes));
}

export function fromBase64(s: string): Uint8Array {
  return binaryToBytes(atob(s));
}

/** URL-safe base64 without padding — matches Go base64.RawURLEncoding (owner/device ids). */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
