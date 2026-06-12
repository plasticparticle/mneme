import type { JSX, VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon, type IconName } from './ui/Icon';
import { Wordmark } from './ui/Wordmark';
import { ConnectionDot, connLabel } from './ui/primitives';
import { useIsDesktop } from './hooks/useMediaQuery';
import { useTheme } from './hooks/useTheme';
import { useAppData, type SyncStatus } from './state/data';
import type { Journal } from './data/sample';
import type { TemplateRecord } from './sync/engine';
import { Onboarding } from './screens/Onboarding';
import { JournalsScreen, NewJournalSheet } from './screens/Journals';
import { JournalEntriesScreen } from './screens/JournalEntries';
import { CalendarScreen } from './screens/Calendar';
import { EditorScreen } from './screens/Editor';
import { RotatePhraseSheet } from './ui/RotatePhrase';
import { TemplatesSheet } from './ui/Templates';
import { SearchSheet } from './ui/Search';

// 'journal' is the mobile-only drill-in: the entry list of one notebook.
type Flow = 'journals' | 'journal' | 'calendar' | 'editor';

// ── DESKTOP sidebar ─────────────────────────────────────────
function Sidebar({ flow, setFlow, journals, onOpenJournal, dark, toggleDark, status, onRotate, onTemplates, onSearch, onLock }: {
  flow: Flow;
  setFlow: (f: Flow) => void;
  journals: Journal[];
  onOpenJournal: (j: Journal) => void;
  dark: boolean;
  toggleDark: () => void;
  status: SyncStatus;
  onRotate: () => void;
  onTemplates: () => void;
  onSearch: () => void;
  onLock: () => void;
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

      {/* Search field — opens the vault-wide search palette (also ⌘/Ctrl+K). */}
      <button
        onClick={onSearch}
        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', boxSizing: 'border-box', cursor: 'text', padding: '8px 11px', marginBottom: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-3)', fontFamily: 'var(--ui)', fontSize: 13.5, textAlign: 'left' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-line)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
      >
        <Icon name="search" size={16} />
        <span style={{ flex: 1 }}>Search</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, border: '1px solid var(--line)', borderRadius: 6, padding: '1px 5px' }}>⌘K</span>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav('journals', 'books', 'Journals')}
        {nav('calendar', 'cal', 'Calendar')}
        {nav('editor', 'feather', 'Write')}
        {/* Templates open as a sheet, not a flow — styled to match the nav rows. */}
        <button
          onClick={onTemplates}
          style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '9px 11px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--ink-2)', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 500 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Icon name="copy" size={19} /> Templates
        </button>
      </div>

      <div style={{ fontFamily: 'var(--ui)', fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--ink-3)', padding: '20px 10px 8px' }}>Notebooks</div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {journals.map((j) => (
          <button
            key={j.id}
            onClick={() => onOpenJournal(j)}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ConnectionDot status={status} size={7} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{connLabel(status).toLowerCase()}</span>
          </div>
        </div>
        <button
          title="Replace recovery phrase"
          onClick={onRotate}
          style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="shield" size={17} color="var(--ink-3)" />
        </button>
        <button
          title="Lock journal"
          onClick={onLock}
          style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="lock" size={17} color="var(--ink-3)" />
        </button>
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

// Compact mobile settings: appearance + the replace-recovery-phrase entry point
// (the bottom-nav settings button used to just toggle the theme).
function MobileSettingsSheet({ onClose, dark, toggleDark, onRotate, onTemplates, onLock }: {
  onClose: () => void;
  dark: boolean;
  toggleDark: () => void;
  onRotate: () => void;
  onTemplates: () => void;
  onLock: () => void;
}): VNode {
  const row: JSX.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '13px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--line)', padding: '20px 22px 30px', boxShadow: '0 20px 60px rgba(30,20,12,.3)' }}>
        <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 16px' }} />
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: '0 0 16px' }}>Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={toggleDark} style={row}>
            <Icon name={dark ? 'sun' : 'moon'} size={18} color="var(--ink-2)" />
            <span style={{ flex: 1 }}>Appearance</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)' }}>{dark ? 'dark' : 'light'}</span>
          </button>
          <button onClick={() => { onClose(); onTemplates(); }} style={row}>
            <Icon name="copy" size={18} color="var(--ink-2)" />
            <span style={{ flex: 1 }}>Templates</span>
            <Icon name="right" size={16} color="var(--ink-3)" />
          </button>
          <button onClick={() => { onClose(); onRotate(); }} style={row}>
            <Icon name="shield" size={18} color="var(--accent)" />
            <span style={{ flex: 1 }}>Replace recovery phrase</span>
            <Icon name="right" size={16} color="var(--ink-3)" />
          </button>
          <button onClick={() => { onClose(); onLock(); }} style={row}>
            <Icon name="lock" size={18} color="var(--ink-2)" />
            <span style={{ flex: 1 }}>Lock journal</span>
            <Icon name="right" size={16} color="var(--ink-3)" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MOBILE bottom nav ───────────────────────────────────────
function MobileNav({ flow, setFlow, onCompose, onSettings, onSearch }: {
  flow: Flow;
  setFlow: (f: Flow) => void;
  onCompose: () => void;
  onSettings: () => void;
  onSearch: () => void;
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
      {item(false, 'search', 'Search', onSearch)}
      {item(false, 'settings', 'Settings', onSettings)}
    </div>
  );
}

export function App(): VNode {
  const desk = useIsDesktop();
  const { dark, toggleDark } = useTheme();
  const { status, hasVault, bootstrapping, entries, journals, templates, newJournal, signIn, unlock, lock, createEntry, rotatePhrase } = useAppData();
  const [flow, setFlowRaw] = useState<Flow>('journals');
  const [modal, setModal] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Which entry the editor is currently editing (null → editor shows its empty state).
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  // Which notebook the mobile 'journal' flow is showing.
  const [openJournalId, setOpenJournalId] = useState<string | null>(null);
  // Where the mobile editor's back button returns to (the flow it was entered from).
  const [editorReturn, setEditorReturn] = useState<Flow>('journals');

  // ⌘/Ctrl+K opens search from anywhere (once unlocked).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Locked until a mnemonic — or the passphrase over a sealed seed — unlocks an
  // in-memory identity. Hold rendering until the keystore check resolves so a
  // device with a sealed seed starts on the unlock view, not a welcome flash.
  if (status === 'locked') {
    if (hasVault === null) return <div style={{ height: '100%', background: 'var(--paper)' }} />;
    return (
      <div style={{ height: '100%' }}>
        <Onboarding desk={desk} hasVault={hasVault} onEnter={(mnemonic, passphrase) => void signIn(mnemonic, passphrase)} onUnlock={unlock} />
      </div>
    );
  }

  const setFlow = (f: Flow) => setFlowRaw(f);

  // Open an existing entry in the editor, remembering which flow to return to.
  const openEntry = (id: string) => {
    if (flow !== 'editor') setEditorReturn(flow);
    setOpenEntryId(id);
    setFlow('editor');
  };

  // Create a fresh empty entry (encrypted + queued for the relay) and open it.
  const newEntry = (journalId?: string) => {
    const entry = createEntry({ journalId: journalId ?? journals[0]?.id ?? 'j-personal' });
    openEntry(entry.id);
  };

  // Start a new entry pre-filled from a template ("Use" in the templates sheet,
  // or a "Start from" pick when creating a journal).
  const newEntryFromTemplate = (t: TemplateRecord, journalId?: string) => {
    const entry = createEntry({
      journalId: journalId ?? journals[0]?.id ?? 'j-personal',
      bodyJson: t.bodyJson,
      bodyText: t.bodyText,
    });
    openEntry(entry.id);
  };

  // Opening a notebook: on mobile it drills into the notebook's entry list (the
  // editor is full-screen there, so jumping straight into the latest entry left
  // no way to browse or pick another one). On desktop it jumps to the most
  // recent entry — the editor's left pane already shows the journal-scoped list.
  // While the first sync is still running, an empty notebook stays on the
  // journals screen on desktop (the syncing notice explains why) instead of
  // silently creating a blank entry for content that just hasn't arrived yet.
  const openJournal = (j: Journal) => {
    if (!desk) {
      setOpenJournalId(j.id);
      setFlow('journal');
      return;
    }
    const latest = entries.filter((e) => e.journalId === j.id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) openEntry(latest.id);
    else if (!bootstrapping) newEntry(j.id);
  };

  const openJournalObj = journals.find((j) => j.id === openJournalId);

  const screen = (() => {
    if (flow === 'calendar') return <CalendarScreen desk={desk} onOpenEntry={(id) => (id ? openEntry(id) : newEntry())} />;
    if (flow === 'editor') return <EditorScreen desk={desk} entryId={openEntryId} onBack={() => setFlow(editorReturn)} onSelectEntry={openEntry} onNew={newEntry} />;
    if (flow === 'journal' && !desk && openJournalObj) {
      return (
        <JournalEntriesScreen
          journal={openJournalObj}
          onBack={() => setFlow('journals')}
          onOpenEntry={openEntry}
          onNew={() => newEntry(openJournalObj.id)}
          syncing={bootstrapping}
        />
      );
    }
    return <JournalsScreen desk={desk} journals={journals} onOpen={openJournal} onNew={() => setModal(true)} onSearch={() => setSearchOpen(true)} syncing={bootstrapping} />;
  })();

  // A picked result closes the palette and opens the entry in the editor.
  const searchSheet = searchOpen && (
    <SearchSheet desk={desk} onClose={() => setSearchOpen(false)} onOpen={(id) => { setSearchOpen(false); openEntry(id); }} />
  );

  const onCreateJournal = (j: Journal, template?: TemplateRecord) => {
    newJournal(j);
    setModal(false);
    // "Start from" a template → the journal opens straight into its first entry.
    if (template) newEntryFromTemplate(template, j.id);
  };

  // Selecting "Write" with nothing open starts a fresh entry rather than a blank screen.
  const navTo = (f: Flow) => {
    if (f === 'editor' && !openEntryId) newEntry();
    else setFlow(f);
  };

  if (desk) {
    return (
      <div style={{ height: '100%', display: 'flex', background: 'var(--paper)', position: 'relative' }}>
        <Sidebar flow={flow} setFlow={navTo} journals={journals} onOpenJournal={openJournal} dark={dark} toggleDark={toggleDark} status={status} onRotate={() => setRotateOpen(true)} onTemplates={() => setTemplatesOpen(true)} onSearch={() => setSearchOpen(true)} onLock={lock} />
        <div style={{ flex: 1, minWidth: 0 }}>{screen}</div>
        {searchSheet}
        {modal && <NewJournalSheet desk templates={templates.filter((t) => !t.deleted)} onClose={() => setModal(false)} onCreate={onCreateJournal} />}
        {templatesOpen && <TemplatesSheet desk onClose={() => setTemplatesOpen(false)} onUse={(t) => { setTemplatesOpen(false); newEntryFromTemplate(t); }} />}
        {rotateOpen && <RotatePhraseSheet desk onClose={() => setRotateOpen(false)} rotate={rotatePhrase} />}
      </div>
    );
  }

  // mobile
  const showNav = flow === 'journals' || flow === 'journal' || flow === 'calendar';
  return (
    <div style={{ height: '100%', position: 'relative', background: 'var(--paper)' }}>
      {screen}
      {/* Inside a notebook the Journals tab stays lit and compose writes into it. */}
      {showNav && <MobileNav flow={flow === 'journal' ? 'journals' : flow} setFlow={navTo} onCompose={() => newEntry(flow === 'journal' ? openJournalObj?.id : undefined)} onSettings={() => setSettingsOpen(true)} onSearch={() => setSearchOpen(true)} />}
      {searchSheet}
      {modal && <NewJournalSheet desk={false} templates={templates.filter((t) => !t.deleted)} onClose={() => setModal(false)} onCreate={onCreateJournal} />}
      {settingsOpen && <MobileSettingsSheet onClose={() => setSettingsOpen(false)} dark={dark} toggleDark={toggleDark} onRotate={() => setRotateOpen(true)} onTemplates={() => setTemplatesOpen(true)} onLock={lock} />}
      {templatesOpen && <TemplatesSheet desk={false} onClose={() => setTemplatesOpen(false)} onUse={(t) => { setTemplatesOpen(false); newEntryFromTemplate(t); }} />}
      {rotateOpen && <RotatePhraseSheet desk={false} onClose={() => setRotateOpen(false)} rotate={rotatePhrase} />}
    </div>
  );
}
