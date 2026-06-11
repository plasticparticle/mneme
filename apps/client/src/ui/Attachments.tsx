// Media attachment cards. Bytes resolve lazily through a caller-provided
// resolver (local DB → relay download + decrypt), so opening an entry never
// blocks on media and another device's recording streams in on demand.
//
// Cards are rendered in two places: inline in the document via the TipTap
// mediaAttachment node view (editor/media.tsx — the normal path), and by
// <AttachmentList> below for legacy entries whose attachments predate inline
// media and live only in the entry's attachments array.
import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { JournalEntry, MediaAttachment } from '../sync/engine';
import { useAppData } from '../state/data';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { fmtDuration } from './VideoCapture';

export type MediaResolver = (att: MediaAttachment) => Promise<Blob | null>;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Resolve an attachment to a playable object URL; `failed` flips on when the
// bytes aren't reachable yet (e.g. recorded on another device, not uploaded).
function useMediaUrl(att: MediaAttachment, resolve: MediaResolver): { url: string | null; failed: boolean; retry: () => void } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Bump to retry a failed load.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    void resolve(att).then((blob) => {
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
  }, [att.id, attempt]);

  return { url, failed, retry: () => setAttempt((n) => n + 1) };
}

// Deleting a recording is destructive and unrecoverable (no relay-side copy the
// user can get back; local bytes are purged) — always confirm first.
export function ConfirmDeleteDialog({
  att,
  onCancel,
  onConfirm,
}: {
  att: MediaAttachment;
  onCancel: () => void;
  onConfirm: () => void;
}): VNode {
  const noun = att.kind === 'audio' ? 'audio recording' : 'video recording';
  return (
    <div
      role="dialog"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,22,16,.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 400, maxWidth: '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--line)', padding: 22, boxShadow: '0 20px 60px rgba(30,20,12,.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(228,87,61,.12)' }}>
            <Icon name={att.kind === 'audio' ? 'mic' : 'video'} size={17} color="#E4573D" />
          </span>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            Delete this {noun}?
          </h3>
        </div>
        <p style={{ fontFamily: 'var(--ui)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 18px' }}>
          It will be removed from this entry and the recording itself
          {att.durationMs ? ` (${fmtDuration(att.durationMs)}, ${fmtBytes(att.bytes)})` : ` (${fmtBytes(att.bytes)})`} will be
          deleted from this device and the sync server.{' '}
          <strong style={{ color: 'var(--ink)' }}>This cannot be undone or recovered.</strong>
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn kind="danger" onClick={onConfirm}>Delete recording</Btn>
        </div>
      </div>
    </div>
  );
}

/** One attachment card (video or audio): player, caption, and confirmed delete. */
export function MediaCard({
  att,
  resolve,
  onDelete,
}: {
  att: MediaAttachment;
  resolve: MediaResolver;
  /** Called after the user confirmed; omit to hide the delete affordance. */
  onDelete?: () => void;
}): VNode {
  const { url, failed, retry } = useMediaUrl(att, resolve);
  const [confirming, setConfirming] = useState(false);

  const placeholder = (
    <div style={{ height: att.kind === 'audio' ? 64 : 150, display: 'flex', flexDirection: att.kind === 'audio' ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: 9, color: 'var(--ink-3)' }}>
      <Icon name={att.kind === 'audio' ? 'mic' : 'video'} size={att.kind === 'audio' ? 18 : 22} color="var(--ink-3)" />
      {failed ? (
        <button
          onClick={retry}
          style={{ fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}
        >
          Not available yet — retry
        </button>
      ) : (
        <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5 }}>Loading {att.kind}…</span>
      )}
    </div>
  );

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
      {url
        ? att.kind === 'audio'
          ? <audio src={url} controls style={{ display: 'block', width: '100%', padding: '10px 11px 4px', boxSizing: 'border-box' }} />
          : <video src={url} controls playsInline style={{ display: 'block', width: '100%', maxHeight: 420, background: '#1a140e' }} />
        : placeholder}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px 5px 11px' }}>
        <Icon name={att.kind === 'audio' ? 'mic' : 'video'} size={14} color="var(--ink-3)" />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', flex: 1 }}>
          {att.kind} · {att.durationMs ? `${fmtDuration(att.durationMs)} · ` : ''}{fmtBytes(att.bytes)}
        </span>
        {onDelete && (
          <button
            onClick={() => setConfirming(true)}
            title={`Delete ${att.kind} recording`}
            style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-3)' }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {confirming && (
        <ConfirmDeleteDialog
          att={att}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete?.();
          }}
        />
      )}
    </div>
  );
}

/**
 * Legacy fallback: entries written before inline media keep their attachments
 * in the entry's attachments array and render after the document. New
 * recordings are inline mediaAttachment nodes and never reach this list.
 */
export function AttachmentList({ entry }: { entry: JournalEntry }): VNode | null {
  const { mediaBlob, updateEntry, removeMedia } = useAppData();
  const attachments = entry.attachments ?? [];
  if (!attachments.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '18px 0 6px' }}>
      {attachments.map((att) => (
        <MediaCard
          key={att.id}
          att={att}
          resolve={(a) => mediaBlob(entry.id, a)}
          onDelete={() => {
            updateEntry(entry.id, { attachments: attachments.filter((a) => a.id !== att.id) });
            removeMedia(att.id);
          }}
        />
      ))}
    </div>
  );
}
