// Live integration check: runs the real client crypto + sync modules against a
// running relay. Start Postgres + the Go server, then:
//
//   RELAY_URL=http://localhost:8080 pnpm dlx tsx apps/client/scripts/integration.ts
//
// Exercises register → challenge-response auth → encrypted push → pull → decrypt,
// and a second "device" (same mnemonic) decrypting the first device's entry.
import assert from 'node:assert/strict';
import { RelayClient } from '../src/sync/relay';
import { identityFromMnemonic, authenticate } from '../src/sync/identity';
import { generateMnemonic } from '../src/crypto/mnemonic';
import { pushEntries, pullEntries, type JournalEntry } from '../src/sync/engine';
import { newEntryId } from '../src/sync/ids';

const base = process.env.RELAY_URL ?? 'http://localhost:8080';
const relay = new RelayClient(base);

const mnemonic = generateMnemonic();
console.log('mnemonic:', mnemonic);

// Device A: register + authenticate.
const idA = identityFromMnemonic(mnemonic);
const sessionA = await authenticate(relay, idA);
assert.equal(sessionA.ownerId, idA.ownerId, 'server owner_id must match client-derived owner_id');
console.log('authenticated · owner', sessionA.ownerId.slice(0, 12) + '…');

// Push an encrypted entry.
const now = Date.now();
const entry: JournalEntry = {
  id: newEntryId(),
  journalId: 'j-personal',
  title: 'The long way home',
  bodyText: 'a secret that the relay can never read',
  labels: ['reflection'],
  createdAt: now,
  updatedAt: now,
};
const applied = await pushEntries(relay, sessionA.token, idA.dataKey, [entry]);
assert.ok(applied.has(entry.id), 'push should be applied');
console.log('pushed entry', entry.id.slice(0, 8) + '…');

// Stale clock is rejected (LWW).
const stale = await pushEntries(relay, sessionA.token, idA.dataKey, [{ ...entry, updatedAt: now - 1000 }]);
assert.ok(!stale.has(entry.id), 'stale clock must be rejected');

// Pull + decrypt on device A.
const pulledA = await pullEntries(relay, sessionA.token, idA.dataKey, 0);
const gotA = pulledA.entries.find((e) => e.id === entry.id);
assert.ok(gotA, 'entry should come back on pull');
assert.equal(gotA.title, entry.title);
assert.equal(gotA.bodyText, entry.bodyText);
console.log('device A decrypted:', JSON.stringify(gotA.bodyText));

// Device B: same mnemonic, fresh session → must decrypt A's entry.
const idB = identityFromMnemonic(mnemonic);
const sessionB = await authenticate(relay, idB);
const pulledB = await pullEntries(relay, sessionB.token, idB.dataKey, 0);
const gotB = pulledB.entries.find((e) => e.id === entry.id);
assert.ok(gotB, 'device B should see the entry');
assert.equal(gotB.bodyText, entry.bodyText, 'device B decrypts the same plaintext');
console.log('device B decrypted the same plaintext ✓');

console.log('\nINTEGRATION OK');
