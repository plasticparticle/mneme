import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './Icon';
import type { Journal } from '../data/sample';

// Moving an entry between notebooks. journalId travels inside the encrypted
// entry body (sync/engine.ts) and is persisted by db.putLocal, so a move
// re-files the entry on every device and the relay never learns the grouping.
//
// Two entry points share one sheet: the editor header's journal badge
// (JournalPicker, a click-to-edit chip mirroring EntryDateTime) and the ⋯
// entry-actions menu (which opens JournalSheet directly).

export function JournalPicker({
  journals,
  currentId,
  desk,
  onChange,
}: {
  journals: Journal[];
  currentId: string;
  desk: boolean;
  onChange: (journalId: string) => void;
}): VNode {
  const current = journals.find((j) => j.id === currentId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        title="Move to another notebook"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', borderRadius: 8, padding: '3px 7px', margin: '-3px -7px', cursor: 'pointer', color: 'var(--ink-3)', transition: 'all .14s' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)'; }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 9, background: current?.color ?? 'var(--ink-3)' }} />
        <span style={{ fontFamily: 'var(--ui)', fontSize: 13 }}>{current?.name ?? 'No notebook'}</span>
        <Icon name="down" size={12} />
      </button>
      {open && (
        <JournalSheet
          journals={journals}
          currentId={current?.id}
          desk={desk}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            if (id !== current?.id) onChange(id);
          }}
        />
      )}
    </>
  );
}

export function JournalSheet({
  journals,
  currentId,
  desk,
  onClose,
  onPick,
}: {
  journals: Journal[];
  currentId: string | undefined;
  desk: boolean;
  onClose: () => void;
  onPick: (journalId: string) => void;
}): VNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: desk ? 'center' : 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: desk ? 380 : '100%', maxHeight: '70vh', boxSizing: 'border-box', overflow: 'auto', background: 'var(--surface)', borderRadius: desk ? 20 : '24px 24px 0 0', border: '1px solid var(--line)', padding: desk ? 22 : '18px 22px calc(env(safe-area-inset-bottom, 0px) + 26px)', boxShadow: '0 20px 60px rgba(30,20,12,.3)' }}
      >
        {!desk && <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 14px' }} />}

        <div style={{ fontFamily: 'var(--ui)', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 }}>Move to notebook</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {journals.map((j) => {
            const active = j.id === currentId;
            return (
              <button
                key={j.id}
                onClick={() => onPick(j.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '10px 11px', borderRadius: 12, border: '1px solid transparent', background: active ? 'var(--accent-soft)' : 'transparent', transition: 'background .12s' }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 4, flexShrink: 0, background: j.color }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: active ? 'var(--accent-ink)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.name}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.count} {j.count === 1 ? 'entry' : 'entries'}</span>
                </span>
                {active && <Icon name="check" size={17} color="var(--accent)" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
