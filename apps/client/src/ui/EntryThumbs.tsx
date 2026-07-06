// A compact row of image thumbnails for an entry in the overview lists. Tiles
// resolve lazily through a caller-provided resolver (normally mediaThumb — a
// cached, downscaled JPEG, so the lists never decode full-resolution images),
// and the row never blocks on media. Up to four tiles render; with more than
// four images the fourth tile dims its preview and shows a "+N" hint for the
// remaining count.
import type { VNode } from 'preact';
import type { JSONContent } from '@tiptap/core';
import type { JournalEntry, MediaAttachment } from '../sync/engine';
import { docImages } from '../editor/media';
import { t } from '../i18n';
import { useMediaUrl, type MediaResolver } from './Attachments';

/** Image attachments of an entry, preferring inline bodyJson, then legacy attachments. */
export function entryImages(entry: JournalEntry): MediaAttachment[] {
  if (entry.bodyJson) {
    try {
      const imgs = docImages(JSON.parse(entry.bodyJson) as JSONContent);
      if (imgs.length) return imgs;
    } catch {
      // fall through to legacy attachments
    }
  }
  return (entry.attachments ?? []).filter((a) => a.kind === 'image');
}

function Thumb({ att, resolve, size, overlay }: { att: MediaAttachment; resolve: MediaResolver; size: number; overlay?: string }): VNode {
  const { url, failed } = useMediaUrl(att, resolve);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
      }}
    >
      {url && !failed && <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {overlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {overlay}
        </div>
      )}
    </div>
  );
}

/** Thumbnails for an entry's images: up to 4 tiles, the 4th a "+N" hint when there are more. */
export function EntryThumbs({ images, resolve, size = 34 }: { images: MediaAttachment[]; resolve: MediaResolver; size?: number }): VNode | null {
  if (images.length === 0) return null;
  // Beyond four images, keep three previews and turn the fourth tile into a hint.
  const shown = images.length > 4 ? images.slice(0, 3) : images.slice(0, 4);
  const extra = images.length - shown.length;
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
      {shown.map((att) => (
        <Thumb key={att.id} att={att} resolve={resolve} size={size} />
      ))}
      {extra > 0 && <Thumb key="more" att={images[3]} resolve={resolve} size={size} overlay={t('media.moreCount', { count: extra })} />}
    </div>
  );
}
