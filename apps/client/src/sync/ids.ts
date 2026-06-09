import { randomBytes } from '../crypto/bytes';

// Random 128-bit entry id as hex. Deliberately NOT timestamp/ULID-encoded: the
// relay sees entry_id in cleartext, and a time-encoded id would leak the writing
// chronology (CLAUDE.md §3 leak-guard). Ordering uses lww_clock, not the id.
export function newEntryId(): string {
  const b = randomBytes(16);
  let hex = '';
  for (const x of b) hex += x.toString(16).padStart(2, '0');
  return hex;
}
