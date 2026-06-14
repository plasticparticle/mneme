// Day One import roundtrip — no relay or browser needed.
//   pnpm --filter client exec tsx scripts/dayone-import.ts
//
// Builds a synthetic Day One JSON export (zipped with fflate), parses it back
// through parseDayOneArchive, then runs importDayOne against an in-memory mock of
// the app surface. Asserts journal mapping, Markdown → ProseMirror conversion,
// title/date/tag handling, and media attachment (including gallery grouping).
import { strict as assert } from 'node:assert';
import { zipSync, strToU8 } from 'fflate';
import type { JSONContent } from '@tiptap/core';
import { parseDayOneArchive } from '../src/import/dayone';
import { importDayOne, type ImportApi } from '../src/import/run';
import type { MediaAttachment } from '../src/sync/engine';
import type { Journal } from '../src/data/sample';

// --- Build a synthetic export ------------------------------------------------

const travel = {
  metadata: { version: '1.0' },
  entries: [
    {
      uuid: 'A1',
      creationDate: '2021-07-04T09:41:00Z',
      tags: ['travel', 'reflection'],
      text: [
        '# The long way home',
        '',
        'Took the **28 tram** the _wrong_ way on purpose. Here is `inline code`.',
        '',
        '- a bullet',
        '- another bullet',
        '',
        '- [ ] unchecked task',
        '- [x] done task',
        '',
        '> a quote line',
        '',
        '```python',
        'print("hi")',
        '```',
        '',
        '![](dayone-moment://IMG1)',
        '![](dayone-moment://IMG2)',
        '![](dayone-moment:/video/VID1)',
      ].join('\n'),
      photos: [
        { identifier: 'IMG1', md5: 'aaa111', type: 'jpeg', width: 800, height: 600 },
        { identifier: 'IMG2', md5: 'bbb222', type: 'png', width: 640, height: 480 },
      ],
      videos: [{ identifier: 'VID1', md5: 'ccc333', type: 'mov', duration: 12 }],
    },
  ],
};

const mine = {
  metadata: { version: '1.0' },
  entries: [
    {
      uuid: 'B1',
      creationDate: '2022-01-02T07:02:00Z',
      tags: ['morning'],
      text: 'Before the noise\n\nCoffee, then the page.',
    },
    {
      uuid: 'B2',
      creationDate: 'not-a-date',
      text: '![](dayone-moment://MISSING)\n\nMedia-only-ish entry with a missing file.',
      photos: [{ identifier: 'MISSING', md5: 'zzz999', type: 'jpeg' }],
    },
  ],
};

const zip = zipSync({
  'Travel.json': strToU8(JSON.stringify(travel)),
  'My Journal.json': strToU8(JSON.stringify(mine)),
  'photos/aaa111.jpeg': new Uint8Array([1, 2, 3, 4]),
  'photos/bbb222.png': new Uint8Array([5, 6, 7, 8]),
  'videos/ccc333.mov': new Uint8Array([9, 9, 9, 9, 9]),
  // note: photos/zzz999.jpeg deliberately absent → tests skippedMedia
});

// --- Parse -------------------------------------------------------------------

const archive = parseDayOneArchive(zip);
assert.equal(archive.journals.length, 2, 'two journals parsed');
assert.equal(archive.entryCount, 3, 'three entries total');
assert.equal(archive.mediaCount, 3, 'three resolvable media files (missing one excluded)');
console.log('✓ parse: 2 journals, 3 entries, 3 resolvable media');

// --- Mock app surface --------------------------------------------------------

interface Created { id: string; journalId: string }
const newJournals: Journal[] = [];
const created: Created[] = [];
const updated = new Map<string, { title?: string; bodyJson?: string; bodyText?: string; labels?: string[]; createdAt?: number }>();
const addedMedia: { entryId: string; kind: string; bytes: number }[] = [];
let entrySeq = 0;
let mediaSeq = 0;

const api: ImportApi = {
  journals: [{ id: 'j-personal', name: 'My Journal', subtitle: '', count: 0, color: '#000', cover: 'lines', last: '' }],
  newJournal(j) { newJournals.push(j); },
  createEntry(input) {
    const id = `e${++entrySeq}`;
    created.push({ id, journalId: input.journalId });
    return { id };
  },
  updateEntry(id, patch) { updated.set(id, patch); },
  async addMedia(entryId, kind, blob) {
    const bytes = (await blob.arrayBuffer()).byteLength;
    const att: MediaAttachment = { id: `m${++mediaSeq}`, kind, mime: blob.type, bytes, createdAt: 0 };
    addedMedia.push({ entryId, kind, bytes });
    return att;
  },
};

// --- Run ---------------------------------------------------------------------

const summary = await importDayOne(archive, api);
assert.equal(summary.entries, 3, 'all three entries imported');
assert.equal(summary.journals, 1, 'only "Travel" created; "My Journal" reused by name');
assert.equal(summary.media, 3, 'three media files attached');
assert.equal(summary.skippedMedia, 1, 'one missing media reference skipped');
console.log('✓ import summary:', JSON.stringify(summary));

// Journal mapping: Travel created, My Journal reused.
assert.equal(newJournals.length, 1, 'one new journal');
assert.equal(newJournals[0].name, 'Travel');
const travelId = newJournals[0].id;
const travelEntries = created.filter((c) => c.journalId === travelId);
assert.equal(travelEntries.length, 1, 'one entry in Travel');
const mineEntries = created.filter((c) => c.journalId === 'j-personal');
assert.equal(mineEntries.length, 2, 'two entries reused into My Journal');
console.log('✓ journals: Travel created, My Journal reused');

// The rich travel entry: title, date, tags, and document structure.
const t = updated.get(travelEntries[0].id)!;
assert.equal(t.title, 'The long way home', 'title pulled from leading heading');
assert.deepEqual(t.labels, ['travel', 'reflection'], 'tags became labels');
assert.equal(t.createdAt, Date.parse('2021-07-04T09:41:00Z'), 'creationDate preserved');

const doc = JSON.parse(t.bodyJson!) as JSONContent;
const types = (doc.content ?? []).map((n) => n.type);
assert.ok(!types.includes('heading'), 'title heading removed from body (no duplication)');
assert.ok(types.includes('bulletList'), 'bullet list present');
assert.ok(types.includes('taskList'), 'task list present');
assert.ok(types.includes('blockquote'), 'blockquote present');
assert.ok(types.includes('codeBlock'), 'code block present');

// Inline marks survived.
const flat = JSON.stringify(doc);
assert.ok(flat.includes('"type":"bold"'), 'bold mark present');
assert.ok(flat.includes('"type":"italic"'), 'italic mark present');
assert.ok(flat.includes('"type":"code"'), 'inline code mark present');

// Media: two consecutive images → one gallery; the video → its own attachment.
const gallery = (doc.content ?? []).find((n) => n.type === 'mediaGallery');
assert.ok(gallery, 'consecutive images grouped into a gallery');
assert.equal((gallery!.attrs!.images as unknown[]).length, 2, 'gallery holds both images');
const video = (doc.content ?? []).find((n) => n.type === 'mediaAttachment' && n.attrs?.kind === 'video');
assert.ok(video, 'video became its own attachment node');
assert.equal(addedMedia.filter((m) => m.entryId === travelEntries[0].id).length, 3, 'three media added for travel entry');
console.log('✓ document: structure, marks, and media nodes correct');

// The missing-media entry still imported, without the broken image.
const b2 = updated.get(mineEntries[1].id)!;
const b2doc = JSON.parse(b2.bodyJson!) as JSONContent;
assert.ok(!JSON.stringify(b2doc).includes('mediaGallery'), 'missing image left no node');
assert.ok(!Number.isNaN(b2.createdAt!), 'bad date fell back to a number');
console.log('✓ partial export: missing media skipped, entry intact');

console.log('\nAll Day One import assertions passed.');
