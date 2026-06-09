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

  private async post<T>(path: string, body: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* non-JSON error body */
      }
      throw new RelayError(res.status, msg);
    }
    return (await res.json()) as T;
  }
}

/** The relay base URL: VITE_RELAY_URL in the app, localhost:8080 by default. */
export function defaultRelayUrl(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_RELAY_URL ?? 'http://localhost:8080';
}
