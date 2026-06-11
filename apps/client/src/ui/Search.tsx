// Vault-wide search, opened from the navigation (desktop sidebar field,
// mobile bottom-nav Search, the Journals-screen search bar, or ⌘/Ctrl+K).
// Everything is matched client-side over the decrypted in-memory entries —
// the relay only ever holds ciphertext, so there is nothing to query remotely.
// A query matches on title, body content, label names, and the entry date
// (written out in several common formats, so "jun 9", "2026-06-09" or
// "9.6.2026" all hit).
import type { VNode } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { LabelChip } from './primitives';
import { findJournal } from '../data/sample';
import { useAppData } from '../state/data';
import type { JournalEntry } from '../sync/engine';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MAX_RESULTS = 50;
const SNIPPET_RADIUS = 60;

type HitField = 'title' | 'label' | 'date' | 'content';

interface Hit {
  entry: JournalEntry;
  field: HitField; // the strongest field that matched (for the row's tag)
  snippet?: string; // body context, when the content matched
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Human + machine spellings of the entry date, lowercased, for substring matching. */
function dateHaystack(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const mon = MONTHS[m];
  return [
    `${mon} ${day} ${y}`, // june 9 2026 (covers "jun 9" via the prefix)
    `${day} ${mon} ${y}`, // 9 june 2026
    `${mon.slice(0, 3)} ${day} ${y}`, // jun 9 2026
    `${day} ${mon.slice(0, 3)} ${y}`, // 9 jun 2026
    `${y}-${pad(m + 1)}-${pad(day)}`, // 2026-06-09
    `${pad(day)}.${pad(m + 1)}.${y}`, // 09.06.2026
    `${day}.${m + 1}.${y}`, // 9.6.2026
    `${pad(m + 1)}/${pad(day)}/${y}`, // 06/09/2026
  ].join(' · ');
}

/** Body context around the first occurrence of any token. */
function makeSnippet(bodyText: string, tokens: string[]): string | undefined {
  const lower = bodyText.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return undefined;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(bodyText.length, at + SNIPPET_RADIUS * 2);
  return (start > 0 ? '…' : '') + bodyText.slice(start, end).replace(/\s+/g, ' ').trim() + (end < bodyText.length ? '…' : '');
}

function search(entries: JournalEntry[], query: string): Hit[] {
  const q = normalize(query);
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const hits: Hit[] = [];
  for (const e of entries) {
    if (e.deleted) continue;
    const fields: Record<HitField, string> = {
      title: e.title.toLowerCase(),
      label: e.labels.join(' · ').toLowerCase(),
      date: dateHaystack(e.createdAt),
      content: e.bodyText.toLowerCase(),
    };
    const everything = `${fields.title} · ${fields.label} · ${fields.date} · ${fields.content}`;
    // Every token has to land somewhere on the entry (fields may differ).
    if (!tokens.every((t) => everything.includes(t))) continue;

    // Tag the hit with the strongest field: full-query match first, then any token.
    const order: HitField[] = ['title', 'label', 'date', 'content'];
    const field =
      order.find((f) => fields[f].includes(q)) ??
      order.find((f) => tokens.some((t) => fields[f].includes(t))) ??
      'content';
    hits.push({ entry: e, field, snippet: makeSnippet(e.bodyText, tokens) });
  }

  const rank: Record<HitField, number> = { title: 0, label: 1, date: 2, content: 3 };
  return hits
    .sort((a, b) => rank[a.field] - rank[b.field] || b.entry.updatedAt - a.entry.updatedAt)
    .slice(0, MAX_RESULTS);
}

/** Render text with the query tokens emphasized. */
function Highlight({ text, tokens }: { text: string; tokens: string[] }): VNode {
  if (tokens.length === 0) return <>{text}</>;
  const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <span key={i} style={{ color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 3 }}>{p}</span>
          : p,
      )}
    </>
  );
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function SearchSheet({ desk, onClose, onOpen }: {
  desk: boolean;
  onClose: () => void;
  onOpen: (entryId: string) => void;
}): VNode {
  const { entries } = useAppData();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const tokens = normalize(query).split(' ').filter(Boolean);
  const hits = useMemo(() => {
    if (tokens.length > 0) return search(entries, query);
    // Empty query: offer the most recently touched entries as a starting point.
    return [...entries]
      .filter((e) => !e.deleted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map((e): Hit => ({ entry: e, field: 'content' }));
  }, [entries, query]);
  const active = Math.min(index, Math.max(0, hits.length - 1));

  const pick = (h: Hit | undefined): void => {
    if (h) onOpen(h.entry.id);
  };
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      onClose();
    } else if (ev.key === 'ArrowDown' && hits.length > 0) {
      ev.preventDefault();
      setIndex((active + 1) % hits.length);
    } else if (ev.key === 'ArrowUp' && hits.length > 0) {
      ev.preventDefault();
      setIndex((active - 1 + hits.length) % hits.length);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      pick(hits[active]);
    }
  };

  const rows = (
    <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {hits.length === 0 && (
        <div style={{ padding: '28px 16px', textAlign: 'center', fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-3)' }}>
          Nothing matches “{query}” — try a word from an entry, a label, or a date like “jun 9”.
        </div>
      )}
      {hits.map((h, i) => {
        const j = findJournal(h.entry.journalId);
        const hot = i === active;
        return (
          <button
            key={h.entry.id}
            // mousedown + preventDefault keeps focus in the input (no blur flicker).
            onMouseDown={(ev) => { ev.preventDefault(); pick(h); }}
            onMouseEnter={() => setIndex(i)}
            ref={(el) => { if (hot) el?.scrollIntoView({ block: 'nearest' }); }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '10px 12px', borderRadius: 12, border: 'none',
              background: hot ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 9, background: j?.color ?? 'var(--ink-3)', flexShrink: 0, alignSelf: 'center' }} />
              <span style={{ flex: 1, fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Highlight text={h.entry.title || 'Untitled'} tokens={tokens} />
              </span>
              {h.field !== 'content' && tokens.length > 0 && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>
                  {h.field}
                </span>
              )}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>
                <Highlight text={shortDate(h.entry.createdAt)} tokens={tokens} />
              </span>
            </div>
            {h.snippet ? (
              <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-2)', margin: '4px 0 0 16px', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                <Highlight text={h.snippet} tokens={tokens} />
              </p>
            ) : (
              h.entry.bodyText && (
                <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-2)', margin: '4px 0 0 16px', lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.entry.bodyText}
                </p>
              )
            )}
            {h.field === 'label' && h.entry.labels.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 0 16px' }}>
                {h.entry.labels.map((l) => <LabelChip key={l} id={l} size="sm" />)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );

  const inputRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
      <Icon name="search" size={18} color="var(--ink-3)" />
      <input
        ref={(el) => el?.focus()}
        value={query}
        onInput={(ev) => { setQuery((ev.target as HTMLInputElement).value); setIndex(0); }}
        onKeyDown={onKeyDown}
        placeholder="Search titles, content, labels, dates…"
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: 'var(--ui)', fontSize: 15, color: 'var(--ink)', padding: 0,
        }}
      />
      {desk ? (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}>esc</span>
      ) : (
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Icon name="x" size={20} color="var(--ink-2)" />
        </button>
      )}
    </div>
  );

  if (desk) {
    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 620, maxWidth: 'calc(100vw - 48px)', marginTop: '11vh', maxHeight: '64vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18,
            boxShadow: '0 24px 70px rgba(30,20,12,.32)',
          }}
        >
          {inputRow}
          {rows}
        </div>
      </div>
    );
  }

  // Mobile: a full-height sheet so the keyboard and results share the screen.
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'var(--paper)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {inputRow}
      {rows}
    </div>
  );
}
