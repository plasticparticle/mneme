// Ad-hoc check: journals and the AI-settings singleton ride the entry oplog as
// opaque blobs — the record kind AND the journal id live inside the ciphertext;
// the cleartext oplog id is a random recordId (§3: sample journal ids are
// well-known, user journal ids date-encoded — neither may hit the wire).
// Run with a live relay:
//   pnpm --filter client exec tsx scripts/journal-sync-roundtrip.ts
import { generateMnemonic } from '../src/crypto/mnemonic';
import { identityFromMnemonic, authenticate } from '../src/sync/identity';
import { RelayClient, resolveRelayUrl } from '../src/sync/relay';
import {
  pushEntries,
  pushJournals,
  pushAiSettings,
  pullEntries,
  type JournalEntry,
  type JournalRecord,
  type AiSettingsRecord,
} from '../src/sync/engine';
import { defaultAiSettings } from '../src/ai/types';

const relay = new RelayClient(resolveRelayUrl());
const id = identityFromMnemonic(generateMnemonic());
const s = await authenticate(relay, id);
console.log('authenticated · owner', s.ownerId.slice(0, 12) + '…');

const now = Date.now();
const entry: JournalEntry = {
  id: '00'.repeat(15) + 'e1',
  journalId: 'j-personal',
  title: 'plain entry',
  bodyText: 'entry body',
  labels: [],
  createdAt: now,
  updatedAt: now,
};
const journal: JournalRecord = {
  id: 'j-personal', // well-known seed id — must stay inside the ciphertext
  recordId: '00'.repeat(15) + 'a1',
  name: 'My Journal (renamed)',
  subtitle: 'Your first notebook',
  color: '#B0563A',
  cover: 'lines',
  createdAt: now,
  updatedAt: now,
};
const ai: AiSettingsRecord = {
  recordId: '00'.repeat(15) + 'b1',
  settings: { ...defaultAiSettings(), enabled: true, backend: 'ollama' },
  updatedAt: now,
};

await pushEntries(relay, s.token, id.dataKey, [entry]);
await pushJournals(relay, s.token, id.dataKey, [journal]);
await pushAiSettings(relay, s.token, id.dataKey, ai);

const pulled = await pullEntries(relay, s.token, id.dataKey, 0);
if (pulled.entries.length !== 1 || pulled.entries[0].title !== 'plain entry') throw new Error('entry routing broken');
if (pulled.journals.length !== 1) throw new Error('journal routing broken');
const j = pulled.journals[0];
if (j.id !== 'j-personal' || j.recordId !== journal.recordId) throw new Error('journal id indirection broken');
if (j.name !== 'My Journal (renamed)' || j.cover !== 'lines' || j.deleted) throw new Error('journal fields broken');
if (pulled.aiSettings.length !== 1) throw new Error('ai-settings routing broken');
const a = pulled.aiSettings[0];
if (!a.settings?.enabled || a.settings.backend !== 'ollama' || a.deleted) throw new Error('ai-settings fields broken');
console.log('pull routed 1 entry + 1 journal + 1 aiSettings, fields intact ✓');

// Tombstone the journal and clear the AI settings; both must round-trip.
await pushJournals(relay, s.token, id.dataKey, [{ ...journal, deleted: true, updatedAt: now + 1 }]);
await pushAiSettings(relay, s.token, id.dataKey, { recordId: ai.recordId, settings: null, updatedAt: now + 1, deleted: true });
const pulled2 = await pullEntries(relay, s.token, id.dataKey, 0);
const j2 = pulled2.journals.find((x) => x.recordId === journal.recordId);
if (!j2?.deleted || j2.id !== 'j-personal') throw new Error('journal tombstone broken');
const a2 = pulled2.aiSettings.find((x) => x.recordId === ai.recordId);
if (!a2?.deleted || a2.settings !== null) throw new Error('ai-settings tombstone broken');
console.log('journal + ai-settings tombstones round-tripped ✓');
