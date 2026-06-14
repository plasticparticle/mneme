// Ad-hoc check: interview types ride the entry oplog as opaque blobs and route
// by the encrypted `kind` marker on pull — just like templates. Run with a live
// relay:
//   pnpm --filter client exec tsx scripts/interview-types-roundtrip.ts
import { generateMnemonic } from '../src/crypto/mnemonic';
import { identityFromMnemonic, authenticate } from '../src/sync/identity';
import { RelayClient, defaultRelayUrl } from '../src/sync/relay';
import { pushEntries, pushInterviewTypes, pullEntries, type JournalEntry, type InterviewType } from '../src/sync/engine';

const relay = new RelayClient(defaultRelayUrl());
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
const itv: InterviewType = {
  id: '00'.repeat(15) + 'i1',
  name: 'Evening reflection',
  intro: 'Wind down and make sense of the day.',
  prompt: 'Ask about how the day went, a grateful moment, and what to let go of.',
  builtin: 'evening-reflection',
  createdAt: now,
  updatedAt: now,
};

await pushEntries(relay, s.token, id.dataKey, [entry]);
await pushInterviewTypes(relay, s.token, id.dataKey, [itv]);

const pulled = await pullEntries(relay, s.token, id.dataKey, 0);
if (pulled.entries.length !== 1 || pulled.entries[0].title !== 'plain entry') throw new Error('entry routing broken');
if (pulled.interviewTypes.length !== 1) throw new Error('interview-type routing broken');
const t = pulled.interviewTypes[0];
if (t.name !== 'Evening reflection' || t.intro !== itv.intro || t.prompt !== itv.prompt || t.builtin !== 'evening-reflection' || t.deleted) {
  throw new Error('interview-type fields broken');
}
console.log('pull routed 1 entry + 1 interview type, fields intact ✓');

// Tombstone the interview type and confirm the deletion round-trips.
const dead = { ...itv, deleted: true, updatedAt: now + 1 };
await pushInterviewTypes(relay, s.token, id.dataKey, [dead]);
const pulled2 = await pullEntries(relay, s.token, id.dataKey, 0);
const t2 = pulled2.interviewTypes.find((x) => x.id === itv.id);
if (!t2?.deleted) throw new Error('interview-type tombstone broken');
console.log('interview-type tombstone round-tripped ✓');
