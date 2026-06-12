// Preferences overlay — the one settings surface: appearance mode
// (light/dark/system), theme skin + accent, writing stats, the assistant
// entry points, and the vault (identity, lock, phrase rotation, deletion).
// Appearance state is device-local localStorage and never syncs; the vault
// rows just hand off to their existing sheets (RotatePhrase, DeleteVault…).
import type { VNode } from 'preact';
import { useMemo } from 'preact/hooks';
import { Icon, type IconName } from './Icon';
import { ConnectionDot, connLabel } from './primitives';
import { useAppData, type SyncStatus } from '../state/data';
import { PALETTES, SKINS, type ThemeControls, type ThemeMode } from '../hooks/useTheme';
import { compactCount, dayStreak, journaledDays, longestStreak, monthWords, totalWords } from '../state/stats';
import { hexA } from './color';

const MODES: { id: ThemeMode; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
];

function SectionLabel({ children }: { children: string }): VNode {
  return (
    <div style={{ fontFamily: 'var(--ui)', fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--ink-3)', margin: '18px 2px 8px' }}>
      {children}
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }): VNode {
  return (
    <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 25, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontFamily: 'var(--ui)', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  );
}

/** Action row in the mobile-settings style; `danger` tints label + icon. */
function Row({ icon, label, value, danger, onClick }: {
  icon: IconName;
  label: string;
  value?: string;
  danger?: boolean;
  onClick: () => void;
}): VNode {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600, color: danger ? 'var(--accent-ink)' : 'var(--ink)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-line)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
    >
      <Icon name={icon} size={17} color={danger ? 'var(--accent)' : 'var(--ink-2)'} />
      <span style={{ flex: 1 }}>{label}</span>
      {value && <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>{value}</span>}
      <Icon name="right" size={15} color="var(--ink-3)" />
    </button>
  );
}

export function PreferencesSheet({ desk, theme, onClose, ownerId, status, onLock, onRotate, onDeleteVault, onAiSettings, onTemplates, onAsk }: {
  desk: boolean;
  theme: ThemeControls;
  onClose: () => void;
  ownerId: string | null;
  status: SyncStatus;
  onLock: () => void;
  onRotate: () => void;
  onDeleteVault: () => void;
  onAiSettings: () => void;
  /** Mobile-only journal entry points (desktop reaches these from the sidebar). */
  onTemplates?: () => void;
  /** null hides the row (assistant disabled); undefined = desktop, sidebar has it. */
  onAsk?: (() => void) | null;
}): VNode {
  const { entries } = useAppData();
  // Vault rows hand off to full-screen sheets — close this overlay first.
  const handOff = (fn: () => void) => () => {
    onClose();
    fn();
  };

  // Stats run over live (non-tombstoned) entries; day math is UTC like the
  // calendar grid, so streaks here and there always agree.
  const stats = useMemo(() => {
    const live = entries.filter((e) => !e.deleted);
    const now = Date.now();
    const d = new Date(now);
    return {
      entries: live.length,
      words: totalWords(live),
      streak: dayStreak(live, now),
      longest: longestStreak(live),
      days: journaledDays(live),
      month: monthWords(live, d.getUTCFullYear(), d.getUTCMonth()),
    };
  }, [entries]);

  const card = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={
        desk
          ? { width: 480, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--line)', padding: '22px 24px 24px', boxShadow: '0 20px 60px rgba(30,20,12,.3)' }
          : { width: '100%', maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--line)', padding: '14px 22px calc(env(safe-area-inset-bottom, 0px) + 26px)', boxShadow: '0 -20px 60px rgba(30,20,12,.25)' }
      }
    >
      {!desk && <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 14px' }} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Preferences</h3>
        {desk && (
          <button onClick={onClose} title="Close" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={17} color="var(--ink-3)" />
          </button>
        )}
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        {MODES.map((m) => {
          const active = theme.mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => theme.setMode(m.id)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 0 10px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent-line)' : 'var(--line)'}`, background: active ? 'var(--accent-soft)' : 'var(--paper)', color: active ? 'var(--accent-ink)' : 'var(--ink-2)', fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: active ? 700 : 500 }}
            >
              <Icon name={m.icon} size={18} />
              {m.label}
            </button>
          );
        })}
      </div>
      {theme.mode === 'system' && (
        <p style={{ fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-3)', margin: '8px 2px 0' }}>
          Follows this device — currently {theme.dark ? 'dark' : 'light'}.
        </p>
      )}

      <SectionLabel>Theme</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: desk ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 8 }}>
        {SKINS.map((s) => {
          const active = theme.skin === s.id;
          return (
            <button
              key={s.id}
              onClick={() => theme.setSkin(s.id)}
              title={s.hint}
              style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden', borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, background: active ? 'var(--accent-soft)' : 'var(--paper)' }}
            >
              {/* Mini preview in the skin's signature colors, mode-independent. */}
              <span style={{ display: 'block', width: '100%', height: 44, boxSizing: 'border-box', background: s.preview.bg, padding: '9px 10px', borderBottom: `1px solid ${active ? 'var(--accent-line)' : 'var(--line)'}` }}>
                <span style={{ display: 'block', width: '55%', height: 5, borderRadius: 3, background: s.preview.ink, opacity: 0.85 }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: s.preview.accent, flexShrink: 0 }} />
                  <span style={{ display: 'block', flex: 1, maxWidth: '70%', height: 4, borderRadius: 3, background: s.preview.ink, opacity: 0.3 }} />
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: active ? 700 : 600, color: active ? 'var(--accent-ink)' : 'var(--ink-2)' }}>
                {s.name}
                {active && <Icon name="check" size={12} stroke={2.4} />}
              </span>
            </button>
          );
        })}
      </div>

      <SectionLabel>Accent</SectionLabel>
      <div style={{ display: 'flex', gap: desk ? 10 : 6, justifyContent: 'space-between' }}>
        {PALETTES.map((p) => {
          const active = theme.palette === p.id;
          return (
            <button
              key={p.id}
              onClick={() => theme.setPalette(p.id)}
              title={p.name}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '10px 0 8px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent-line)' : 'var(--line)'}`, background: active ? 'var(--accent-soft)' : 'var(--paper)' }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 999, background: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${hexA(p.accent, 0.55)}` : 'none' }}>
                {active && <Icon name="check" size={13} color="#fff" stroke={2.4} />}
              </span>
              <span style={{ fontFamily: 'var(--ui)', fontSize: 10.5, fontWeight: active ? 700 : 500, color: active ? 'var(--accent-ink)' : 'var(--ink-3)' }}>{p.name}</span>
            </button>
          );
        })}
      </div>

      <SectionLabel>Your writing</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: desk ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 8 }}>
        <StatTile value={compactCount(stats.entries)} label="Entries" />
        <StatTile value={compactCount(stats.words)} label="Words" />
        <StatTile value={compactCount(stats.month)} label="This month" />
        <StatTile value={String(stats.streak)} label="Day streak" />
        <StatTile value={String(stats.longest)} label="Longest streak" />
        <StatTile value={compactCount(stats.days)} label="Days journaled" />
      </div>
      <p style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--ink-3)', margin: '10px 2px 0', lineHeight: 1.5 }}>
        Counted locally from your decrypted entries — the server never sees any of this.
      </p>

      <SectionLabel>Assistant & journal</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {onTemplates && <Row icon="copy" label="Templates" onClick={handOff(onTemplates)} />}
        {onAsk && <Row icon="feather" label="Ask my journal" onClick={handOff(onAsk)} />}
        <Row icon="feather" label="AI assistant" onClick={handOff(onAiSettings)} />
      </div>

      <SectionLabel>Vault</SectionLabel>
      <div title={ownerId ? `Vault ID: ${ownerId}` : undefined} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', marginBottom: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, background: 'linear-gradient(145deg, var(--accent), var(--accent-ink))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600 }}>V</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ownerId ? `${ownerId.slice(0, 12)}…` : 'Your vault'}
            </span>
            {ownerId && (
              <span style={{ fontFamily: 'var(--ui)', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-3)', flexShrink: 0 }}>vault id</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <ConnectionDot status={status} size={7} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>{connLabel(status).toLowerCase()}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Row icon="lock" label="Lock journal" onClick={handOff(onLock)} />
        <Row icon="shield" label="Replace recovery phrase" onClick={handOff(onRotate)} />
        <Row icon="trash" label="Delete vault" danger onClick={handOff(onDeleteVault)} />
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(30,22,16,.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: desk ? 'center' : 'flex-end', justifyContent: 'center', padding: desk ? 18 : 0 }}
    >
      {card}
    </div>
  );
}
