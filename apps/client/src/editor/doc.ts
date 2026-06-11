// Shared TipTap/ProseMirror document helpers: the extension set the editor uses,
// plus conversions between our stored shapes (bodyJson string, preview bodyText,
// and the design's sample blocks) and ProseMirror JSON. Keeping this in one place
// means the editor, seeding, and previews all agree on the document schema.
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import type { Extensions, JSONContent } from '@tiptap/core';
import type { Block } from '../data/sample';

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/** The extension set, shared by every editor instance. */
export function buildExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
  ];
}

/** Parse a stored bodyJson string into a ProseMirror doc, falling back to plain text. */
export function parseBody(bodyJson: string | undefined, bodyText: string): JSONContent {
  if (bodyJson) {
    try {
      return JSON.parse(bodyJson) as JSONContent;
    } catch {
      /* fall through to plain text */
    }
  }
  return textToDoc(bodyText);
}

/** Wrap a plain string (one paragraph per line) into a ProseMirror doc. */
export function textToDoc(text: string): JSONContent {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return EMPTY_DOC;
  return {
    type: 'doc',
    content: lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
  };
}

/** Flatten a ProseMirror doc to plain text — used for previews and FTS. */
export function docToText(doc: JSONContent): string {
  const out: string[] = [];
  const walk = (node: JSONContent): void => {
    if (node.type === 'text' && node.text) out.push(node.text);
    // Inline media has no text content; give previews/search a small marker.
    if (node.type === 'mediaAttachment') out.push(node.attrs?.kind === 'audio' ? '🎙 audio' : '🎬 video');
    if (node.content) node.content.forEach(walk);
    // Block-level nodes get a separating newline so previews read naturally.
    if (node.type && node.type !== 'text' && node.type !== 'doc') out.push('\n');
  };
  walk(doc);
  return out.join('').replace(/\n{2,}/g, '\n').trim();
}

/** Media ids of every inline mediaAttachment node in a doc (editor/media.tsx). */
export function docMediaIds(doc: JSONContent): string[] {
  const ids: string[] = [];
  const walk = (node: JSONContent): void => {
    if (node.type === 'mediaAttachment' && typeof node.attrs?.id === 'string' && node.attrs.id) {
      ids.push(node.attrs.id);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return ids;
}

/** Convert the design's sample blocks into a ProseMirror doc (for lived-in seed content). */
export function blocksToDoc(blocks: Block[]): JSONContent {
  const content: JSONContent[] = [];
  const checks: JSONContent[] = [];
  const flushChecks = (): void => {
    if (checks.length) {
      content.push({ type: 'taskList', content: checks.splice(0) });
    }
  };
  for (const b of blocks) {
    if (b.type === 'check') {
      checks.push({
        type: 'taskItem',
        attrs: { checked: b.done },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: b.text }] }],
      });
      continue;
    }
    flushChecks();
    if (b.type === 'p') content.push({ type: 'paragraph', content: [{ type: 'text', text: b.text }] });
    else if (b.type === 'h') content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: b.text }] });
    else if (b.type === 'quote') content.push({ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: b.text }] }] });
    // photo/audio are media (§10 step 5) — represented in the preview only for now.
    else if (b.type === 'photo') content.push({ type: 'paragraph', content: [{ type: 'text', text: `🖼 ${b.caption}` }] });
    else if (b.type === 'audio') content.push({ type: 'paragraph', content: [{ type: 'text', text: `🎙 ${b.label} (${b.dur})` }] });
  }
  flushChecks();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
