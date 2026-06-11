// Predefined entry templates (§10 step 7). These are *seeds*, not fixtures:
// every device lays them down once as ordinary template rows (pristine,
// local-only), and from then on the user owns them — rename, rewrite, delete.
// Ids are random per device (a well-known id in the cleartext entry_id would
// tell the relay which blobs are templates); state/data.tsx retires a pristine
// seed when a synced copy of the same `slug` arrives from another device.
import type { JSONContent } from '@tiptap/core';
import { docToText } from '../editor/doc';
import { newTemplateId } from '../sync/ids';
import type { TemplateRecord } from '../sync/engine';

interface BuiltinTemplate {
  slug: string;
  name: string;
  doc: JSONContent;
}

const h2 = (text: string): JSONContent => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const p = (text?: string): JSONContent =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
const taskItem = (): JSONContent => ({
  type: 'taskItem',
  attrs: { checked: false },
  content: [{ type: 'paragraph' }],
});
const listItem = (): JSONContent => ({ type: 'listItem', content: [{ type: 'paragraph' }] });

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    slug: 'daily',
    name: 'Daily reflection',
    doc: {
      type: 'doc',
      content: [
        h2('How the day felt'),
        p(),
        h2('Worth remembering'),
        p(),
        h2('Tomorrow, one thing'),
        p(),
      ],
    },
  },
  {
    slug: 'gratitude',
    name: 'Three small things',
    doc: {
      type: 'doc',
      content: [
        p('Three small things that made today better:'),
        { type: 'orderedList', attrs: { start: 1 }, content: [listItem(), listItem(), listItem()] },
      ],
    },
  },
  {
    slug: 'dream',
    name: 'Dream log',
    doc: {
      type: 'doc',
      content: [
        h2('The dream'),
        p(),
        h2('How it felt'),
        p(),
        h2('What it might be holding'),
        p(),
      ],
    },
  },
  {
    slug: 'weekly',
    name: 'Weekly review',
    doc: {
      type: 'doc',
      content: [
        h2('What moved'),
        p(),
        h2('What stalled'),
        p(),
        h2('Next week'),
        { type: 'taskList', content: [taskItem(), taskItem(), taskItem()] },
      ],
    },
  },
];

/** Materialize the built-ins as pristine template records (fresh random ids). */
export function seedBuiltinTemplates(now: number): TemplateRecord[] {
  return BUILTIN_TEMPLATES.map((b) => ({
    id: newTemplateId(),
    name: b.name,
    bodyText: docToText(b.doc),
    bodyJson: JSON.stringify(b.doc),
    builtin: b.slug,
    pristine: true,
    createdAt: now,
    updatedAt: now,
  }));
}
