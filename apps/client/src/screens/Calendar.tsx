import type { VNode, ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, LabelChip, ConnChip } from '../ui/primitives';
import { hexA } from '../ui/color';
import { findJournal } from '../data/sample';
import { useAppData } from '../state/data';
import type { JournalEntry } from '../sync/engine';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Calendar view of a JournalEntry — derived (UTC) so seeded + new entries agree.
interface CalEntry {
  id: string;
  journal: string;
  time: string;
  title: string;
  preview: string;
  labels: string[];
}

function toCalEntry(e: JournalEntry): CalEntry {
  const d = new Date(e.createdAt);
  return {
    id: e.id,
    journal: e.journalId,
    time: `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    title: e.title,
    preview: e.bodyText,
    labels: e.labels,
  };
}

function monthMeta(year: number, month: number): { offset: number; days: number } {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun
  const offset = (first + 6) % 7; // Mon-first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { offset, days };
}

function EntryRow({ e, onOpen, compact }: { e: CalEntry; onOpen: (id: string) => void; compact?: boolean }): VNode {
  const j = findJournal(e.journal);
  const color = j?.color ?? 'var(--ink-3)';
  return (
    <button
      onClick={() => onOpen(e.id)}
      style={{ display: 'flex', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', padding: compact ? '10px 12px' : '13px 14px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)', transition: 'all .14s', alignItems: 'flex-start' }}
      onMouseEnter={(ev) => (ev.currentTarget.style.borderColor = hexA(j?.color ?? '#999999', 0.5))}
      onMouseLeave={(ev) => (ev.currentTarget.style.borderColor = 'var(--line)')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 2, minWidth: 42 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>{e.time}</span>
        <span style={{ width: 7, height: 7, borderRadius: 9, background: color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>{e.title}</span>
        <p style={{ fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-2)', margin: '3px 0 0', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.preview}</p>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--ink-3)' }}>{j?.name}</span>
          {e.labels.map((l) => <LabelChip key={l} id={l} size="sm" />)}
        </div>
      </div>
    </button>
  );
}

function Heatmap({ weeks = 17 }: { weeks?: number }): VNode {
  const cells: number[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const seed = (i * 73 + 13) % 11;
    cells.push(seed > 8 ? 3 : seed > 6 ? 2 : seed > 3 ? 1 : 0);
  }
  const col = ['var(--line)', 'var(--accent-soft)', hexA('#B0563A', 0.45), 'var(--accent)'];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 3 }}>
        {cells.map((l, i) => <div key={i} style={{ aspectRatio: '1', borderRadius: 3, background: l === 0 ? col[0] : col[l] }} />)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontFamily: 'var(--ui)', fontSize: 11, color: 'var(--ink-3)' }}>17 weeks</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: 'var(--ui)', fontSize: 11, color: 'var(--ink-3)' }}>less</span>
          {col.map((c, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 2.5, background: c }} />)}
          <span style={{ fontFamily: 'var(--ui)', fontSize: 11, color: 'var(--ink-3)' }}>more</span>
        </div>
      </div>
    </div>
  );
}

function Cell({ d, today, selected, onSelect, big, dayEntries }: { d: number; today: number; selected: number; onSelect: (d: number) => void; big?: boolean; dayEntries: CalEntry[] }): VNode {
  const entries = dayEntries;
  const isToday = d === today;
  const isSel = d === selected;
  return (
    <button
      onClick={() => onSelect(d)}
      style={{
        position: 'relative', aspectRatio: big ? '1.15' : '1', borderRadius: big ? 12 : 999,
        display: 'flex', flexDirection: 'column', alignItems: big ? 'stretch' : 'center', justifyContent: big ? 'flex-start' : 'center',
        cursor: 'pointer', padding: big ? '7px 8px' : 0,
        background: isSel ? 'var(--accent)' : big && entries.length ? 'var(--surface)' : 'transparent',
        border: big ? `1px solid ${isSel ? 'var(--accent)' : 'var(--line)'}` : isToday && !isSel ? '1.5px solid var(--accent)' : '1.5px solid transparent',
        transition: 'all .12s',
      }}
    >
      <span style={{ fontFamily: 'var(--ui)', fontSize: big ? 13 : 14, fontWeight: isToday || isSel ? 700 : 500, color: isSel ? '#fff' : isToday ? 'var(--accent-ink)' : 'var(--ink)', alignSelf: big ? 'flex-start' : 'center' }}>{d}</span>

      {big ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5, overflow: 'hidden' }}>
          {entries.slice(0, 3).map((e) => {
            const j = findJournal(e.journal);
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9, background: isSel ? '#fff' : j?.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--ui)', fontSize: 11, color: isSel ? 'rgba(255,255,255,.9)' : 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
              </div>
            );
          })}
          {entries.length > 3 && <span style={{ fontFamily: 'var(--ui)', fontSize: 10.5, color: isSel ? 'rgba(255,255,255,.85)' : 'var(--ink-3)' }}>+{entries.length - 3} more</span>}
        </div>
      ) : (
        entries.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 4, position: 'absolute', bottom: 6 }}>
            {entries.slice(0, 3).map((e) => {
              const j = findJournal(e.journal);
              return <span key={e.id} style={{ width: 5, height: 5, borderRadius: 9, background: isSel ? '#fff' : j?.color }} />;
            })}
          </div>
        )
      )}
    </button>
  );
}

export function CalendarScreen({ desk, onOpenEntry }: { desk: boolean; onOpenEntry: (id: string) => void }): VNode {
  const { entries } = useAppData();
  const [offset, setOffset] = useState(0); // months from "today"
  const now = new Date();
  const baseY = now.getUTCFullYear();
  const baseM = now.getUTCMonth();
  const mAbs = baseM + offset;
  const year = baseY + Math.floor(mAbs / 12);
  const month = ((mAbs % 12) + 12) % 12;
  const isCurrentMonth = offset === 0;
  const meta = monthMeta(year, month);
  const today = isCurrentMonth ? now.getUTCDate() : -1;
  const [selected, setSelected] = useState(now.getUTCDate());

  // Group this month's entries by day-of-month.
  const byDay = new Map<number, CalEntry[]>();
  for (const e of entries) {
    const d = new Date(e.createdAt);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
      const day = d.getUTCDate();
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(toCalEntry(e));
    }
  }
  const monthCount = [...byDay.values()].reduce((n, list) => n + list.length, 0);
  const dayEntries = byDay.get(selected) ?? [];

  const Grid = ({ big }: { big?: boolean }): VNode => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: big ? 6 : 2, marginBottom: 6 }}>
        {WD.map((w) => <div key={w} style={{ textAlign: 'center', fontFamily: 'var(--ui)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--ink-3)', textTransform: 'uppercase', padding: '2px 0' }}>{big ? w : w[0]}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: big ? 6 : 2 }}>
        {Array.from({ length: meta.offset }).map((_, i) => <div key={'b' + i} />)}
        {Array.from({ length: meta.days }).map((_, i) => (
          <Cell key={i} d={i + 1} today={today} selected={selected} onSelect={setSelected} big={big} dayEntries={byDay.get(i + 1) ?? []} />
        ))}
      </div>
    </div>
  );

  const MonthNav = ({ big }: { big?: boolean }): VNode => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: big ? 26 : 24, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{MONTHS[month]}</h2>
        <span style={{ fontFamily: 'var(--ui)', fontSize: big ? 18 : 16, color: 'var(--ink-3)' }}>{year}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isCurrentMonth && <Btn kind="quiet" size="sm" onClick={() => { setOffset(0); setSelected(now.getUTCDate()); }}>Today</Btn>}
        <button onClick={() => setOffset((o) => o - 1)} style={navBtn}><Icon name="left" size={18} color="var(--ink-2)" /></button>
        <button onClick={() => setOffset((o) => o + 1)} style={navBtn}><Icon name="right" size={18} color="var(--ink-2)" /></button>
      </div>
    </div>
  );

  if (desk) {
    return (
      <div style={{ height: '100%', display: 'flex', background: 'var(--paper)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}><MonthNav big /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
            <Stat n="12" label="day streak" />
            <Stat n={String(monthCount)} label="entries" />
            <Stat n="1.4k" label="words" />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--line)' }}>
              <ViewTab active icon="cal">Month</ViewTab>
              <ViewTab icon="timeline">Timeline</ViewTab>
            </div>
          </div>
          <div style={{ flex: 1 }}><Grid big /></div>
        </div>
        <div style={{ width: 340, borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--surface-2)' }}>
          <div style={{ padding: '24px 22px 14px' }}>
            <div style={{ fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              {`${WD[(new Date(Date.UTC(year, month, selected)).getUTCDay() + 6) % 7]} · ${MONTHS[month]} ${selected}`}
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500, color: 'var(--ink)', marginTop: 2 }}>{dayEntries.length ? `${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'}` : 'Nothing yet'}</div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dayEntries.length ? dayEntries.map((e) => <EntryRow key={e.id} e={e} onOpen={onOpenEntry} compact />) : <EmptyDay onNew={() => onOpenEntry('')} />}
          </div>
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--ui)', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>This season</div>
            <Heatmap />
          </div>
        </div>
      </div>
    );
  }

  // ── mobile ──
  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--paper)', paddingBottom: 84 }}>
      <div style={{ padding: '60px 18px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <ConnChip />
        </div>
        <MonthNav />
        <div style={{ display: 'flex', gap: 10, margin: '16px 0 14px' }}>
          <Stat n="12" label="day streak" boxed />
          <Stat n={String(monthCount)} label="entries" boxed />
          <Stat n="1.4k" label="words" boxed />
        </div>
        <div style={{ padding: 14, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <Grid />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 2px 12px' }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{`${MONTHS[month]} ${selected}`}</h3>
          <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-3)' }}>{dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dayEntries.length ? dayEntries.map((e) => <EntryRow key={e.id} e={e} onOpen={onOpenEntry} />) : <EmptyDay onNew={() => onOpenEntry('')} />}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label, boxed }: { n: string; label: string; boxed?: boolean }): VNode {
  if (boxed) {
    return (
      <div style={{ flex: 1, padding: '10px 12px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>{n}</div>
        <div style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--ink-3)' }}>{label}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>{n}</span>
      <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

function ViewTab({ children, active, icon }: { children: ComponentChildren; active?: boolean; icon: IconName }): VNode {
  return (
    <button style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: 'none', background: active ? 'var(--paper)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-3)', boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none' }}>
      <Icon name={icon} size={15} /> {children}
    </button>
  );
}

function EmptyDay({ onNew }: { onNew: () => void }): VNode {
  return (
    <div style={{ padding: '30px 20px', borderRadius: 16, border: '1.5px dashed var(--line)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Icon name="feather" size={26} color="var(--ink-3)" />
      <div style={{ fontFamily: 'var(--ui)', fontSize: 13.5, color: 'var(--ink-2)' }}>No entries on this day.</div>
      <Btn kind="soft" size="sm" icon="plus" onClick={onNew}>Write something</Btn>
    </div>
  );
}

const navBtn = { width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as const;
