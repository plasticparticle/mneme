import type { VNode } from 'preact';
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { Icon, type IconName } from '../ui/Icon';
import { Placeholder, LabelChip, SyncBadge, Cover } from '../ui/primitives';
import { OPEN_ENTRY, findJournal, type Block as BlockType, type OpenEntry } from '../data/sample';
import { useAppData } from '../state/data';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Block({ b }: { b: BlockType }): VNode | null {
  const baseP = { fontFamily: 'var(--editor-font)', fontSize: 'var(--editor-size)', lineHeight: 1.72, color: 'var(--ink)', margin: '0 0 var(--editor-gap)', textWrap: 'pretty' as const };
  if (b.type === 'p') return <p style={baseP}>{b.text}</p>;
  if (b.type === 'h') return <h3 style={{ fontFamily: 'var(--editor-font)', fontSize: 'calc(var(--editor-size) * 1.28)', fontWeight: 600, color: 'var(--ink)', margin: '8px 0 12px' }}>{b.text}</h3>;
  if (b.type === 'quote') {
    return (
      <blockquote style={{ margin: '4px 0 var(--editor-gap)', padding: '4px 0 4px 20px', borderLeft: '3px solid var(--accent)' }}>
        <span style={{ fontFamily: 'var(--editor-font)', fontStyle: 'italic', fontSize: 'calc(var(--editor-size) * 1.08)', lineHeight: 1.6, color: 'var(--ink-2)' }}>{b.text}</span>
      </blockquote>
    );
  }
  if (b.type === 'photo') {
    return (
      <figure style={{ margin: '6px 0 var(--editor-gap)' }}>
        <Placeholder label="photo · alfama.jpg" h={210} r={14} />
        <figcaption style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 8 }}>{b.caption}</figcaption>
      </figure>
    );
  }
  if (b.type === 'check') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, margin: '0 0 10px' }}>
        <span style={{ width: 21, height: 21, borderRadius: 7, flexShrink: 0, marginTop: 'calc(var(--editor-size) * 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: b.done ? 'var(--accent)' : 'transparent', border: `1.6px solid ${b.done ? 'var(--accent)' : 'var(--ink-3)'}` }}>
          {b.done && <Icon name="check" size={14} color="#fff" stroke={2.4} />}
        </span>
        <span style={{ fontFamily: 'var(--editor-font)', fontSize: 'var(--editor-size)', lineHeight: 1.5, color: b.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: b.done ? 'line-through' : 'none' }}>{b.text}</span>
      </div>
    );
  }
  if (b.type === 'audio') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, margin: '6px 0 var(--editor-gap)', padding: '12px 15px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)' }}>
        <button style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="14" height="16" viewBox="0 0 14 16"><path d="M2 1.5l10 6.5-10 6.5z" fill="#fff" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 26 }}>
            {Array.from({ length: 34 }).map((_, i) => {
              const h = 5 + Math.abs(Math.sin(i * 1.3)) * 18 * (1 - Math.abs(i - 17) / 34);
              return <span key={i} style={{ flex: 1, height: Math.max(4, h), borderRadius: 2, background: i < 12 ? 'var(--accent)' : 'var(--line)' }} />;
            })}
          </div>
          <div style={{ fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>{b.label}</div>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)' }}>{b.dur}</span>
      </div>
    );
  }
  return null;
}

const TOOLS: [IconName, string][] = [
  ['bold', 'Bold'], ['italic', 'Italic'], ['heading', 'Heading'], ['quote', 'Quote'],
  ['list', 'List'], ['checklist', 'Checklist'], ['image', 'Photo'], ['mic', 'Audio'],
];

function MetaLine({ e }: { e: OpenEntry }): VNode {
  const item = (icon: IconName, text: string): VNode | null =>
    text ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-3)' }}>
        <Icon name={icon} size={14} color="var(--ink-3)" />
        <span style={{ fontFamily: 'var(--ui)', fontSize: 13 }}>{text}</span>
      </span>
    ) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', margin: '10px 0 16px' }}>
      {item('clock', `${e.dateLabel} · ${e.time}`)}
      {item('pin', e.place)}
      {e.weather && <span style={{ fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-3)' }}>{e.weather}</span>}
    </div>
  );
}

export function EditorScreen({ desk, onBack }: { desk: boolean; onBack: () => void }): VNode {
  const e = OPEN_ENTRY;
  const journal = findJournal(e.journal);
  const { entries } = useAppData();
  const [activeTool, setActiveTool] = useState<IconName | null>(null);

  const Body = ({ pad }: { pad: string | number }): VNode => (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {e.labels.map((l) => <LabelChip key={l} id={l} />)}
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', background: 'transparent', border: '1px dashed var(--line)', borderRadius: 999, padding: '3px 9px', cursor: 'pointer' }}>
          <Icon name="plus" size={13} /> label
        </button>
      </div>
      <h1 style={{ fontFamily: 'var(--editor-font)', fontSize: desk ? 38 : 30, fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.15, letterSpacing: 0.2 }}>{e.title}</h1>
      <MetaLine e={e} />
      <div>{e.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22, color: 'var(--ink-3)' }}>
        <span style={{ width: 28, height: 1, background: 'var(--line)' }} />
        <Icon name="feather" size={15} color="var(--ink-3)" />
        <span style={{ fontFamily: 'var(--ui)', fontSize: 12 }}>{e.words} words · saved just now</span>
      </div>
    </div>
  );

  const Toolbar = ({ floating }: { floating?: boolean }): VNode => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 5, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: floating ? '0 8px 24px rgba(40,28,18,.14)' : 'none' }}>
      {TOOLS.map(([ic, label], i) => (
        <Fragment key={ic}>
          {(i === 2 || i === 4 || i === 6) && <span style={{ width: 1, height: 22, background: 'var(--line)', margin: '0 4px' }} />}
          <button title={label} onClick={() => setActiveTool((t) => (t === ic ? null : ic))} style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', background: activeTool === ic ? 'var(--accent-soft)' : 'transparent', color: activeTool === ic ? 'var(--accent-ink)' : 'var(--ink-2)' }}>
            <Icon name={ic} size={19} />
          </button>
        </Fragment>
      ))}
    </div>
  );

  if (desk) {
    const list = [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 7);
    return (
      <div style={{ height: '100%', display: 'flex', background: 'var(--paper)' }}>
        {/* entry list */}
        <div style={{ width: 312, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--surface-2)' }}>
          <div style={{ padding: '22px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {journal && <Cover journal={journal} w={26} h={34} r={6} />}
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>{journal?.name}</div>
                <div style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--ink-3)' }}>{journal?.count} entries</div>
              </div>
            </div>
            <button style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="plus" size={18} color="var(--accent-ink)" /></button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {list.map((x) => {
              const j = findJournal(x.journalId);
              const active = x.id === e.id;
              const d = new Date(x.createdAt);
              return (
                <button key={x.id} style={{ textAlign: 'left', cursor: 'pointer', padding: '12px 13px', borderRadius: 12, border: 'none', background: active ? 'var(--surface)' : 'transparent', borderLeft: `2.5px solid ${active ? j?.color ?? 'transparent' : 'transparent'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{MON[d.getUTCMonth()]} {d.getUTCDate()}</span>
                  </div>
                  <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-2)', margin: '3px 0 0', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{x.bodyText}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--line)' }}>
            <Toolbar />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-3)' }}>{e.words} words</span>
              <SyncBadge />
              <button style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="more" size={18} color="var(--ink-2)" /></button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ maxWidth: 660, margin: '0 auto', padding: '40px 32px 80px' }}><Body pad={0} /></div>
          </div>
        </div>
      </div>
    );
  }

  // ── mobile ──
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 14px 10px', flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-ink)', fontFamily: 'var(--ui)', fontSize: 15, fontWeight: 600 }}>
          <Icon name="left" size={22} color="var(--accent-ink)" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: 9, background: journal?.color }} />
            <span style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{journal?.name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}><Icon name="lock" size={18} color="var(--accent)" /></button>
          <button style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}><Icon name="more" size={20} color="var(--ink-2)" /></button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Body pad="6px 22px 120px" />
      </div>

      {/* floating format toolbar */}
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 30, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 5, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 10px 30px rgba(40,28,18,.18)', overflowX: 'auto', maxWidth: '100%' }}>
          {TOOLS.map(([ic, label]) => (
            <button key={ic} title={label} onClick={() => setActiveTool((t) => (t === ic ? null : ic))} style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', flexShrink: 0, background: activeTool === ic ? 'var(--accent-soft)' : 'transparent', color: activeTool === ic ? 'var(--accent-ink)' : 'var(--ink-2)' }}>
              <Icon name={ic} size={20} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
