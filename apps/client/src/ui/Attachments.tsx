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

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short human noun for a media kind ("video recording", "photo", …). */
export function mediaNoun(kind: MediaAttachment['kind']): string {
  if (kind === 'audio') return 'audio recording';
  if (kind === 'video') return 'video recording';
  if (kind === 'image') return 'photo';
  return 'file';
}

function mediaIcon(kind: MediaAttachment['kind']): 'mic' | 'video' | 'image' | 'file' {
  if (kind === 'audio') return 'mic';
  if (kind === 'video') return 'video';
  if (kind === 'image') return 'image';
  return 'file';
}

// Resolve an attachment to a playable object URL; `failed` flips on when the
// bytes aren't reachable yet (e.g. recorded on another device, not uploaded).
export function useMediaUrl(att: MediaAttachment, resolve: MediaResolver): { url: string | null; failed: boolean; retry: () => void } {
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

// Deleting a media item is destructive and unrecoverable (no relay-side copy the
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
  const noun = mediaNoun(att.kind);
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
            <Icon name={mediaIcon(att.kind)} size={17} color="#E4573D" />
          </span>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            Delete this {noun}?
          </h3>
        </div>
        <p style={{ fontFamily: 'var(--ui)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 18px' }}>
          {att.name ? <><strong style={{ color: 'var(--ink)' }}>{att.name}</strong> will be removed</> : <>It will be removed</>} from
          this entry and the {noun} itself
          {att.durationMs ? ` (${fmtDuration(att.durationMs)}, ${fmtBytes(att.bytes)})` : ` (${fmtBytes(att.bytes)})`} will be
          deleted from this device and the sync server.{' '}
          <strong style={{ color: 'var(--ink)' }}>This cannot be undone or recovered.</strong>
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn kind="danger" onClick={onConfirm}>Delete {noun.includes('recording') ? 'recording' : noun}</Btn>
        </div>
      </div>
    </div>
  );
}

/** One attachment card (video, audio, image, or file): preview, caption, and confirmed delete. */
export function MediaCard({
  att,
  resolve,
  onDelete,
  onOpen,
}: {
  att: MediaAttachment;
  resolve: MediaResolver;
  /** Called after the user confirmed; omit to hide the delete affordance. */
  onDelete?: () => void;
  /** Images only: maximize in the lightbox. */
  onOpen?: () => void;
}): VNode {
  const { url, failed, retry } = useMediaUrl(att, resolve);
  const [confirming, setConfirming] = useState(false);
  const compact = att.kind === 'audio' || att.kind === 'file';

  const retryBtn = (
    <button
      onClick={retry}
      style={{ fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}
    >
      Not available yet — retry
    </button>
  );

  const placeholder = (
    <div style={{ height: compact ? 64 : 150, display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: 9, color: 'var(--ink-3)' }}>
      <Icon name={mediaIcon(att.kind)} size={compact ? 18 : 22} color="var(--ink-3)" />
      {failed ? retryBtn : <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5 }}>Loading {mediaNoun(att.kind)}…</span>}
    </div>
  );

  const deleteBtn = onDelete && (
    <button
      onClick={() => setConfirming(true)}
      title={`Delete ${mediaNoun(att.kind)}`}
      style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-3)', flexShrink: 0 }}
    >
      <Icon name="x" size={14} />
    </button>
  );

  // Generic files have no preview: one row with the name, size, and a download link.
  if (att.kind === 'file') {
    return (
      <div style={{ borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 9px 10px 13px' }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <Icon name="file" size={18} color="var(--ink-2)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {att.name || 'Attached file'}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
            {fmtBytes(att.bytes)}{att.mime ? ` · ${att.mime}` : ''}
          </div>
        </div>
        {url ? (
          <a
            href={url}
            download={att.name || 'attachment'}
            title="Download file"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-ink)', flexShrink: 0 }}
          >
            <Icon name="download" size={16} />
          </a>
        ) : failed ? (
          retryBtn
        ) : (
          <span style={{ fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>Loading…</span>
        )}
        {deleteBtn}
        {confirming && (
          <ConfirmDeleteDialog att={att} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onDelete?.(); }} />
        )}
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
      {url
        ? att.kind === 'audio'
          ? <audio src={url} controls style={{ display: 'block', width: '100%', padding: '10px 11px 4px', boxSizing: 'border-box' }} />
          : att.kind === 'image'
            ? <img
                src={url}
                alt={att.name || 'photo'}
                onClick={onOpen}
                style={{ display: 'block', width: '100%', maxHeight: 560, objectFit: 'cover', cursor: onOpen ? 'zoom-in' : 'default', background: 'var(--surface)' }}
              />
            : <video src={url} controls playsInline style={{ display: 'block', width: '100%', maxHeight: 420, background: '#1a140e' }} />
        : placeholder}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px 5px 11px' }}>
        <Icon name={mediaIcon(att.kind)} size={14} color="var(--ink-3)" />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {att.name || att.kind} · {att.durationMs ? `${fmtDuration(att.durationMs)} · ` : ''}{fmtBytes(att.bytes)}
        </span>
        {deleteBtn}
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

// ── Image galleries (the inline rendering for uploaded photos) ──

// One thumbnail in a gallery grid: square crop, click to maximize, optional
// confirmed delete. `single` renders the photo at its natural aspect instead.
function GalleryTile({
  att,
  resolve,
  single,
  onOpen,
  onDelete,
}: {
  att: MediaAttachment;
  resolve: MediaResolver;
  single: boolean;
  onOpen?: () => void;
  onDelete?: () => void;
}): VNode {
  const { url, failed, retry } = useMediaUrl(att, resolve);
  const [confirming, setConfirming] = useState(false);

  // Reserve the right footprint before bytes arrive (and for unreachable photos).
  const aspect = single && att.width && att.height ? `${att.width} / ${att.height}` : undefined;
  const frame: Record<string, string | number> = single
    ? { position: 'relative', width: '100%', aspectRatio: aspect ?? '3 / 2', maxHeight: 560, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface-2)' }
    : { position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface-2)' };

  return (
    <div style={frame}>
      {url ? (
        <img
          src={url}
          alt={att.name || 'photo'}
          onClick={onOpen}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', cursor: onOpen ? 'zoom-in' : 'default' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--ink-3)' }}>
          <Icon name="image" size={20} color="var(--ink-3)" />
          {failed ? (
            <button
              onClick={retry}
              style={{ fontFamily: 'var(--ui)', fontSize: 11.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}
            >
              Retry
            </button>
          ) : (
            <span style={{ fontFamily: 'var(--ui)', fontSize: 11.5 }}>Loading…</span>
          )}
        </div>
      )}
      {onDelete && (
        <button
          onClick={() => setConfirming(true)}
          title="Delete photo"
          style={{ position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(30,22,16,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
        >
          <Icon name="x" size={13} />
        </button>
      )}
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
 * Uploaded photos: a single image renders inline at its natural aspect; several
 * collapse into a thumbnail grid. Clicking a photo maximizes it (the caller's
 * onOpen drives the lightbox, which navigates across the whole entry's images).
 */
export function ImageGallery({
  images,
  resolve,
  onOpen,
  onDelete,
}: {
  images: MediaAttachment[];
  resolve: MediaResolver;
  onOpen?: (att: MediaAttachment) => void;
  /** Called after the user confirmed deleting one photo. */
  onDelete?: (att: MediaAttachment) => void;
}): VNode | null {
  if (images.length === 0) return null;
  const single = images.length === 1;
  // 2 and 4 photos split evenly in two columns; everything else flows in three.
  const cols = single ? 1 : images.length === 2 || images.length === 4 ? 2 : 3;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7 }}>
      {images.map((att) => (
        <GalleryTile
          key={att.id}
          att={att}
          resolve={resolve}
          single={single}
          onOpen={onOpen ? () => onOpen(att) : undefined}
          onDelete={onDelete ? () => onDelete(att) : undefined}
        />
      ))}
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
