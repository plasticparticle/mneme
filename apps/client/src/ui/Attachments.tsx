// Entry attachment rendering. Bytes resolve lazily through state/data.tsx
// mediaBlob (local DB → relay download + decrypt), so opening an entry never
// blocks on media and another device's recording streams in on demand.
import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { MediaAttachment } from '../sync/engine';
import { useAppData } from '../state/data';
import { Icon } from './Icon';
import { fmtDuration } from './VideoCapture';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoAttachmentCard({ entryId, att }: { entryId: string; att: MediaAttachment }): VNode {
  const { mediaBlob } = useAppData();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Bump to retry a failed load (e.g. recorded on another device, not yet uploaded).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    void mediaBlob(entryId, att).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setFailed(true);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entryId, att.id, attempt]);

  const caption = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px' }}>
      <Icon name="video" size={14} color="var(--ink-3)" />
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>
        video · {att.durationMs ? `${fmtDuration(att.durationMs)} · ` : ''}{fmtBytes(att.bytes)}
      </span>
    </div>
  );

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
      {url ? (
        <video src={url} controls playsInline style={{ display: 'block', width: '100%', maxHeight: 420, background: '#1a140e' }} />
      ) : (
        <div style={{ height: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9, color: 'var(--ink-3)' }}>
          <Icon name="video" size={22} color="var(--ink-3)" />
          {failed ? (
            <button
              onClick={() => setAttempt((n) => n + 1)}
              style={{ fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}
            >
              Not available yet — retry
            </button>
          ) : (
            <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5 }}>Loading video…</span>
          )}
        </div>
      )}
      {caption}
    </div>
  );
}

export function AttachmentList({ entryId, attachments }: { entryId: string; attachments: MediaAttachment[] }): VNode | null {
  if (!attachments.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '18px 0 6px' }}>
      {attachments.map((att) => (
        <VideoAttachmentCard key={att.id} entryId={entryId} att={att} />
      ))}
    </div>
  );
}
