// Inline media: a block-level atom node embedding a recording card in the
// document flow. The attachment metadata lives in the node attrs, which
// serialize into bodyJson and therefore travel inside the encrypted entry
// body (§3) — the relay still only ever sees the random media id.
//
// TipTap has no Preact binding, so the node view mounts the shared <MediaCard>
// into its own DOM element with preact's render(); delete goes through the
// card's confirmation dialog before the node is removed and the local bytes
// are purged (the handlers' onRemoved).
import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { render } from 'preact';
import type { MediaAttachment } from '../sync/engine';
import { MediaCard, type MediaResolver } from '../ui/Attachments';

export interface MediaNodeHandlers {
  resolve: MediaResolver;
  /** Called after a confirmed delete removed the node — purge local bytes/outbox. */
  onRemoved: (att: MediaAttachment) => void;
}

export const MEDIA_NODE = 'mediaAttachment';

/** Insert a captured recording at the current selection. */
export function insertMediaAttachment(editor: Editor, att: MediaAttachment): void {
  editor.chain().focus().insertContent({ type: MEDIA_NODE, attrs: { ...att } }).run();
}

// Node attrs round-trip through JSON; coerce defensively back into the shape
// the cards and the sync layer expect.
function nodeAttachment(attrs: Record<string, unknown>): MediaAttachment {
  return {
    id: String(attrs.id ?? ''),
    kind: attrs.kind === 'audio' ? 'audio' : 'video',
    mime: String(attrs.mime ?? ''),
    bytes: Number(attrs.bytes ?? 0),
    durationMs: typeof attrs.durationMs === 'number' ? attrs.durationMs : undefined,
    createdAt: Number(attrs.createdAt ?? 0),
  };
}

export function mediaAttachmentNode(handlers: MediaNodeHandlers): Node {
  return Node.create({
    name: MEDIA_NODE,
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        id: { default: '' },
        kind: { default: 'video' },
        mime: { default: '' },
        bytes: { default: 0 },
        durationMs: { default: null },
        createdAt: { default: 0 },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-media-attachment]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-media-attachment': '' })];
    },
    addNodeView() {
      return ({ node, editor, getPos }) => {
        const dom = document.createElement('div');
        dom.className = 'mneme-media-node';
        dom.contentEditable = 'false';
        const att = nodeAttachment(node.attrs);
        // Runs only after the user confirmed in the card's dialog.
        const onDelete = (): void => {
          const pos = getPos();
          if (typeof pos !== 'number') return;
          editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
          handlers.onRemoved(att);
        };
        render(
          <MediaCard att={att} resolve={handlers.resolve} onDelete={editor.isEditable ? onDelete : undefined} />,
          dom,
        );
        return {
          dom,
          // Keep ProseMirror's hands off interactions with the embedded player,
          // the delete button, and the confirmation dialog.
          stopEvent: (event: Event) => {
            const t = event.target as HTMLElement | null;
            return !!t?.closest('audio, video, button, [role="dialog"]');
          },
          destroy: () => render(null, dom),
        };
      };
    },
  });
}
