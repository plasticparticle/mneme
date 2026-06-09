import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { Icon, type IconName } from './ui/Icon';
import { Wordmark } from './ui/Wordmark';
import { useIsDesktop } from './hooks/useMediaQuery';
import { useTheme } from './hooks/useTheme';
import { useAppData, type SyncStatus } from './state/data';
import type { Journal } from './data/sample';
import { Onboarding } from './screens/Onboarding';
import { JournalsScreen, NewJournalSheet } from './screens/Journals';
import { CalendarScreen } from './screens/Calendar';
import { EditorScreen } from './screens/Editor';

type Flow = 'journals' | 'calendar' | 'editor';

function statusText(s: SyncStatus): string {
  switch (s) {
    case 'connecting':
      return 'connecting…';
    case 'online':
      return 'synced · encrypted';
    case 'offline':
      return 'offline · encrypted';
    default:
      return 'encrypted';
  }
}

function statusColor(s: SyncStatus): string {
  return s === 'online' ? 'var(--accent)' : s === 'offline' ? 'var(--ink-3)' : 'var(--ink-2)';
}

// ── DESKTOP sidebar ─────────────────────────────────────────
function Sidebar({ flow, setFlow, journals, onOpenJournal, dark, toggleDark, status }: {
  flow: Flow;
  setFlow: (f: Flow) => void;
  journals: Journal[];
  onOpenJournal: () => void;
  dark: boolean;
  toggleDark: () => void;
  status: SyncStatus;
}): VNode {
  const nav = (key: Flow, icon: IconName, label: string): VNode => {
    const active = flow === key;
    return (
      <button
        onClick={() => setFlow(key)}
        style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '9px 11px', borderRadius: 10, border: 'none', background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent-ink)' : 'var(--ink-2)', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: active ? 600 : 500 }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon name={icon} size={19} /> {label}
      </button>
    );
  };
  return (
    <div style={{ width: 238, flexShrink: 0, borderRight: '1px solid var(--line)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', padding: '18px 14px' }}>
      <div style={{ padding: '4px 8px 18px' }}><Wordmark size={22} /></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav('journals', 'books', 'Journals')}
        {nav('calendar', 'cal', 'Calendar')}
        {nav('editor', 'feather', 'Write')}
      </div>

      <div style={{ fontFamily: 'var(--ui)', fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--ink-3)', padding: '20px 10px 8px' }}>Notebooks</div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {journals.map((j) => (
          <button
            key={j.id}
            onClick={onOpenJournal}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--ink)', fontFamily: 'var(--ui)', fontSize: 13.5 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 11, height: 11, borderRadius: 3, background: j.color, flexShrink: 0 }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{j.count}</span>
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 999, background: 'linear-gradient(145deg, var(--accent), #7b3a1e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600 }}>V</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Your vault</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: 9, background: statusColor(status), flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{statusText(status)}</span>
          </div>
        </div>
        <button
          title={dark ? 'Switch to light' : 'Switch to dark'}
          onClick={toggleDark}
          style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={dark ? 'sun' : 'moon'} size={17} color="var(--ink-3)" />
        </button>
      </div>
    </div>
  );
}

// ── MOBILE bottom nav ───────────────────────────────────────
function MobileNav({ flow, setFlow, onCompose, onSettings }: {
  flow: Flow;
  setFlow: (f: Flow) => void;
  onCompose: () => void;
  onSettings: () => void;
}): VNode {
  const item = (active: boolean, icon: IconName, label: string, onClick: () => void): VNode => (
    <button
      onClick={onClick}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', color: active ? 'var(--accent-ink)' : 'var(--ink-3)' }}
    >
      <Icon name={icon} size={23} stroke={active ? 2 : 1.7} />
      <span style={{ fontFamily: 'var(--ui)', fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40, paddingBottom: 22, paddingTop: 8, display: 'flex', alignItems: 'center', background: 'var(--surface-glass)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid var(--line)' }}>
      {item(flow === 'journals', 'books', 'Journals', () => setFlow('journals'))}
      {item(flow === 'calendar', 'cal', 'Calendar', () => setFlow('calendar'))}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button onClick={onCompose} style={{ width: 54, height: 54, borderRadius: 999, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -22, boxShadow: '0 6px 18px rgba(120,60,30,.35), 0 0 0 5px var(--paper)' }}>
          <Icon name="feather" size={24} color="#fff" />
        </button>
      </div>
      {item(false, 'search', 'Search', () => setFlow('journals'))}
      {item(false, 'settings', 'Settings', onSettings)}
    </div>
  );
}

export function App(): VNode {
  const desk = useIsDesktop();
  const { dark, toggleDark } = useTheme();
  const { status, journals, newJournal, signIn, createEntry } = useAppData();
  const [flow, setFlowRaw] = useState<Flow>('journals');
  const [modal, setModal] = useState(false);

  // Locked until a mnemonic unlocks an in-memory identity (nothing is persisted).
  if (status === 'locked') {
    return (
      <div style={{ height: '100%' }}>
        <Onboarding desk={desk} onEnter={(mnemonic) => void signIn(mnemonic)} />
      </div>
    );
  }

  const setFlow = (f: Flow) => setFlowRaw(f);

  // Compose a real entry (encrypted + queued for the relay) and show it on the calendar.
  const compose = () => {
    const journal = journals[0];
    const now = new Date();
    createEntry({
      journalId: journal?.id ?? 'j-personal',
      title: 'New entry',
      bodyText: `Started at ${now.toLocaleTimeString()}.`,
    });
    setFlow('calendar');
  };

  const screen = (() => {
    if (flow === 'calendar') return <CalendarScreen desk={desk} onOpenEntry={() => setFlow('editor')} />;
    if (flow === 'editor') return <EditorScreen desk={desk} onBack={() => setFlow('journals')} />;
    return <JournalsScreen desk={desk} journals={journals} onOpen={() => setFlow('editor')} onNew={() => setModal(true)} />;
  })();

  const onCreateJournal = (j: Journal) => {
    newJournal(j);
    setModal(false);
  };

  if (desk) {
    return (
      <div style={{ height: '100%', display: 'flex', background: 'var(--paper)', position: 'relative' }}>
        <Sidebar flow={flow} setFlow={setFlow} journals={journals} onOpenJournal={() => setFlow('editor')} dark={dark} toggleDark={toggleDark} status={status} />
        <div style={{ flex: 1, minWidth: 0 }}>{screen}</div>
        {modal && <NewJournalSheet desk onClose={() => setModal(false)} onCreate={onCreateJournal} />}
      </div>
    );
  }

  // mobile
  const showNav = flow === 'journals' || flow === 'calendar';
  return (
    <div style={{ height: '100%', position: 'relative', background: 'var(--paper)' }}>
      {screen}
      {showNav && <MobileNav flow={flow} setFlow={setFlow} onCompose={compose} onSettings={toggleDark} />}
      {modal && <NewJournalSheet desk={false} onClose={() => setModal(false)} onCreate={onCreateJournal} />}
    </div>
  );
}
