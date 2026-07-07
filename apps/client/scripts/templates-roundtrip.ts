// Ad-hoc check: templates ride the entry oplog as opaque blobs and route by the
// encrypted `kind` marker on pull. Run with a live relay:
//   pnpm --filter client exec tsx scripts/templates-roundtrip.ts
import { generateMnemonic } from '../src/crypto/mnemonic';
import { identityFromMnemonic, authenticate } from '../src/sync/identity';
import { RelayClient, resolveRelayUrl } from '../src/sync/relay';
import { pushEntries, pushTemplates, pullEntries, type JournalEntry, type TemplateRecord } from '../src/sync/engine';

const relay = new RelayClient(resolveRelayUrl());
const id = identityFromMnemonic(generateMnemonic());
const s = await authenticate(relay, id);
console.log('authenticated · owner', s.ownerId.slice(0, 12) + '…');

const now = Date.now();
const entry: JournalEntry = {
  id: '00'.repeat(15) + 'e1',
  journalId: 'j-test',
  title: 'plain entry',
  bodyText: 'entry body',
  labels: [],
  createdAt: now,
  updatedAt: now,
};
const tpl: TemplateRecord = {
  id: '00'.repeat(15) + 't1',
  name: 'Morning pages',
  bodyText: 'How the day felt',
  bodyJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
  builtin: 'daily',
  createdAt: now,
  updatedAt: now,
};

await pushEntries(relay, s.token, id.dataKey, [entry]);
await pushTemplates(relay, s.token, id.dataKey, [tpl]);

const pulled = await pullEntries(relay, s.token, id.dataKey, 0);
if (pulled.entries.length !== 1 || pulled.entries[0].title !== 'plain entry') throw new Error('entry routing broken');
if (pulled.templates.length !== 1) throw new Error('template routing broken');
const t = pulled.templates[0];
if (t.name !== 'Morning pages' || t.builtin !== 'daily' || t.deleted) throw new Error('template fields broken');
console.log('pull routed 1 entry + 1 template, fields intact ✓');

// Tombstone the template and confirm the deletion round-trips.
const dead = { ...tpl, deleted: true, updatedAt: now + 1 };
await pushTemplates(relay, s.token, id.dataKey, [dead]);
const pulled2 = await pullEntries(relay, s.token, id.dataKey, 0);
const t2 = pulled2.templates.find((x) => x.id === tpl.id);
if (!t2?.deleted) throw new Error('template tombstone broken');
console.log('template tombstone round-tripped ✓');
