import type { VNode } from 'preact';
import { Icon } from '../ui/Icon';
import { Cover, ConnChip, SyncNotice } from '../ui/primitives';
import type { Journal } from '../data/sample';
import { useAppData } from '../state/data';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Mobile-only drill-in: the entries of one notebook. Desktop never routes here —
// it shows the journal-scoped list as the editor's left pane instead.
export function JournalEntriesScreen({ journal, onBack, onOpenEntry, onNew, onDelete, syncing }: {
  journal: Journal;
  onBack: () => void;
  onOpenEntry: (id: string) => void;
  onNew: () => void;
  /** Opens the typed-"delete" confirmation sheet for this notebook. */
  onDelete: () => void;
  syncing?: boolean;
}): VNode {
  const { entries } = useAppData();
  const list = entries
    .filter((e) => e.journalId === journal.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--paper)', paddingBottom: 110 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 14px 0' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-ink)', fontFamily: 'var(--ui)', fontSize: 15, fontWeight: 600, padding: '6px 4px' }}>
          <Icon name="left" size={22} color="var(--accent-ink)" /> Journals
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ConnChip compact />
          <button title="Delete journal" onClick={onDelete} style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <Icon name="trash" size={18} color="var(--accent)" />
          </button>
          <button title="New entry" onClick={onNew} style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={20} color="var(--accent-ink)" />
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Cover journal={journal} w={46} h={58} r={9} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{journal.name}</h1>
            <p style={{ fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-3)', margin: '2px 0 0' }}>
              {list.length} {list.length === 1 ? 'entry' : 'entries'}{journal.last ? ` · edited ${journal.last}` : ''}
            </p>
          </div>
        </div>

        {syncing && list.length === 0 && <div style={{ margin: '18px 0 0' }}><SyncNotice /></div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '18px 0' }}>
          {list.map((e) => {
            const d = new Date(e.createdAt);
            return (
              <button
                key={e.id}
                onClick={() => onOpenEntry(e.id)}
                style={{ textAlign: 'left', cursor: 'pointer', padding: '13px 15px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${journal.color}` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 16.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title || 'Untitled'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{MON[d.getMonth()]} {d.getDate()}</span>
                </div>
                {e.bodyText && (
                  <p style={{ fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-2)', margin: '4px 0 0', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.bodyText}</p>
                )}
              </button>
            );
          })}

          {list.length === 0 && !syncing && (
            <button
              onClick={onNew}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', padding: 16, borderRadius: 16, background: 'transparent', border: '1.5px dashed var(--line)', color: 'var(--ink-3)' }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 11, border: '1.5px dashed currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="feather" size={20} /></div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: 'var(--ui)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Write the first entry</div>
                <div style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-3)' }}>Nothing in this journal yet</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
