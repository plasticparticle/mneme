// Typed HTTP client for the Go relay. Binary fields are standard base64
// (the relay reads them as Go StdEncoding).

export interface RegisterResp {
  owner_id: string;
  device_id: string;
}
export interface ChallengeResp {
  challenge: string;
  expires_at: string;
}
export interface VerifyResp {
  token: string;
  owner_id: string;
  expires_at: string;
}
export interface PushEntry {
  entry_id: string;
  lww_clock: number;
  ciphertext: string; // base64
  deleted: boolean;
}
export interface PushResp {
  results: { entry_id: string; applied: boolean }[];
}
export interface PullItem {
  entry_id: string;
  lww_clock: number;
  ciphertext: string; // base64
  deleted: boolean;
  seq: number;
}
export interface PullResp {
  entries: PullItem[];
  cursor: number;
  more: boolean;
}
export interface MediaMeta {
  media_id: string;
  bytes: number; // total ciphertext bytes
  chunks: number;
}

export class RelayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

export class RelayClient {
  constructor(private readonly baseUrl: string) {}

  register(ownerPubkey: string, devicePubkey: string, signature: string): Promise<RegisterResp> {
    return this.post('/v1/register', { owner_pubkey: ownerPubkey, device_pubkey: devicePubkey, signature });
  }

  challenge(deviceId: string): Promise<ChallengeResp> {
    return this.post('/v1/auth/challenge', { device_id: deviceId });
  }

  verify(deviceId: string, challenge: string, signature: string): Promise<VerifyResp> {
    return this.post('/v1/auth/verify', { device_id: deviceId, challenge, signature });
  }

  push(token: string, entries: PushEntry[]): Promise<PushResp> {
    return this.post('/v1/sync/push', { entries }, token);
  }

  pull(token: string, since: number, limit = 500): Promise<PullResp> {
    return this.post('/v1/sync/pull', { since, limit }, token);
  }

  // ── media: server-relayed encrypted chunks (opaque to the relay) ──

  /** Upload one encrypted media chunk (raw octet-stream body). */
  async uploadMediaChunk(token: string, mediaId: string, index: number, chunk: Uint8Array): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/media/${mediaId}/chunks/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
      body: chunk as unknown as BodyInit,
    });
    await this.check(res);
  }

  /** Finalize an upload so other devices can discover its chunk count. */
  completeMedia(token: string, mediaId: string, chunks: number, bytes: number): Promise<{ media_id: string }> {
    return this.post(`/v1/media/${mediaId}/complete`, { chunks, bytes }, token);
  }

  async mediaMeta(token: string, mediaId: string): Promise<MediaMeta> {
    const res = await fetch(`${this.baseUrl}/v1/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await this.check(res);
    return (await res.json()) as MediaMeta;
  }

  async downloadMediaChunk(token: string, mediaId: string, index: number): Promise<Uint8Array> {
    const res = await fetch(`${this.baseUrl}/v1/media/${mediaId}/chunks/${index}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await this.check(res);
    return new Uint8Array(await res.arrayBuffer());
  }

  /**
   * Permanently delete one media object (index row + ciphertext chunks).
   * Idempotent on the relay, so the offline deletion queue can retry safely.
   */
  async deleteMedia(token: string, mediaId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/media/${mediaId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await this.check(res);
  }

  /**
   * Permanently delete the authenticated owner and everything stored for it
   * (entries, media, reminders, devices, sessions). Used by phrase rotation
   * after the vault has been re-pushed under the new owner.
   */
  async deleteAccount(token: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await this.check(res);
  }

  private async post<T>(path: string, body: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    await this.check(res);
    return (await res.json()) as T;
  }

  /** Throw a RelayError (with the server's error message, if any) on a non-2xx response. */
  private async check(res: Response): Promise<void> {
    if (res.ok) return;
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* non-JSON error body */
    }
    throw new RelayError(res.status, msg);
  }
}

// A self-hoster points the app at their own relay; under Tauri there is no
// dev-server origin to infer it from, so the URL is a runtime setting persisted
// here rather than only a build-time env var.
const RELAY_URL_KEY = 'mneme:relay-url';

/** The user-set relay override, or null when unset (empty is treated as unset). */
export function getStoredRelayUrl(): string | null {
  try {
    const v = localStorage.getItem(RELAY_URL_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Persist the relay override, or clear it when passed null/empty. */
export function setStoredRelayUrl(url: string | null): void {
  try {
    if (url && url.trim()) localStorage.setItem(RELAY_URL_KEY, url.trim());
    else localStorage.removeItem(RELAY_URL_KEY);
  } catch {
    /* storage unavailable — the build-time default still applies */
  }
}

/** The relay base URL: a user override, else VITE_RELAY_URL, else localhost:8080. */
export function defaultRelayUrl(): string {
  const stored = getStoredRelayUrl();
  if (stored) return stored;
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_RELAY_URL ?? 'http://localhost:8080';
}
