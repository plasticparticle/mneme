// Round-trip check for the WYSIWYG ⇄ markdown source toggle: every node type the
// editor can produce must survive doc → markdown → doc unchanged (marks are
// order-insensitive, so we sort them before comparing). The custom atoms — math,
// entry links, media, galleries — are the ones a naive markdown layer would drop,
// so they're exercised explicitly. Run:
//   pnpm --filter client exec tsx scripts/markdown-roundtrip.ts
import type { JSONContent } from '@tiptap/core';
import { docToMarkdown, markdownToDoc } from '../src/editor/markdown';

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// Sort each node's marks by type and drop empty mark arrays so comparison ignores
// mark ordering (which ProseMirror treats as insignificant for these marks).
function normalize(node: JSONContent): JSONContent {
  const out: JSONContent = { type: node.type };
  if (node.attrs && Object.keys(node.attrs).length) out.attrs = node.attrs;
  if (node.text !== undefined) out.text = node.text;
  if (node.marks && node.marks.length) {
    out.marks = [...node.marks].sort((a, b) => a.type.localeCompare(b.type)).map((m) => ({ type: m.type, ...(m.attrs ? { attrs: m.attrs } : {}) }));
  }
  if (node.content) out.content = node.content.map(normalize);
  return out;
}

function eq(a: JSONContent, b: JSONContent): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

const t = (text: string, ...marks: string[]): JSONContent =>
  marks.length ? { type: 'text', text, marks: marks.map((m) => ({ type: m })) } : { type: 'text', text };

// A document touching every node + mark the editor can emit.
const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [t('Title')] },
    { type: 'heading', attrs: { level: 2 }, content: [t('Section')] },
    {
      type: 'paragraph',
      content: [
        t('plain '),
        t('bold', 'bold'),
        t(' '),
        t('italic', 'italic'),
        t(' '),
        t('both', 'bold', 'italic'),
        t(' '),
        t('struck', 'strike'),
        t(' '),
        t('code()', 'code'),
        t(' end.'),
      ],
    },
    {
      type: 'paragraph',
      content: [t('a line'), { type: 'hardBreak' }, t('next line with '), t('link', 'link') ],
    },
    {
      type: 'paragraph',
      content: [
        t('math '),
        { type: 'inlineMath', attrs: { latex: 'x^2' } },
        t(' and a '),
        { type: 'entryLink', attrs: { entryId: 'abc123', label: 'Other entry' } },
        t('.'),
      ],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [t('quoted '), t('text', 'bold')] }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [t('one')] }] },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [t('two')] },
            {
              type: 'bulletList',
              content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [t('nested')] }] }],
            },
          ],
        },
      ],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [t('first')] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [t('second')] }] },
      ],
    },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [t('todo')] }] },
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [t('done')] }] },
      ],
    },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const x = 1;\nconst y = 2;')] },
    { type: 'horizontalRule' },
    { type: 'blockMath', attrs: { latex: 'E = mc^2' } },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [t('H1')] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [t('H2')] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [t('a')] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [t('b'), t(' bold', 'bold')] }] },
          ],
        },
      ],
    },
    {
      type: 'mediaAttachment',
      attrs: { id: 'm1', kind: 'image', mime: 'image/png', bytes: 4096, name: 'shot.png', width: 800, height: 600, createdAt: 123, durationMs: null },
    },
    {
      type: 'mediaGallery',
      attrs: { images: [{ id: 'g1', kind: 'image', mime: 'image/jpeg', bytes: 1000, width: 100, height: 100 }, { id: 'g2', kind: 'image', mime: 'image/jpeg', bytes: 2000, width: 200, height: 200 }] },
    },
  ],
};

// Fix the link fixture (the helper can't carry mark attrs).
(doc.content![3].content![3] as JSONContent).marks = [{ type: 'link', attrs: { href: 'https://example.com' } }];

const md = docToMarkdown(doc);
const back = markdownToDoc(md);

console.log('─── serialized markdown ───\n' + md + '\n───────────────────────────');

if (!eq(doc, back)) {
  console.error('Round-trip mismatch.');
  const a = normalize(doc).content ?? [];
  const b = normalize(back).content ?? [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      console.error(`\n• block ${i} (${a[i]?.type ?? '∅'} vs ${b[i]?.type ?? '∅'}):`);
      console.error('  expected:', JSON.stringify(a[i]));
      console.error('  got:     ', JSON.stringify(b[i]));
    }
  }
  fail('doc → markdown → doc was not lossless');
}

// Idempotence: re-serializing the parsed doc yields identical markdown.
if (docToMarkdown(back) !== md) fail('markdown → doc → markdown was not stable');

console.log('\n✓ markdown round-trip lossless across every node type');
