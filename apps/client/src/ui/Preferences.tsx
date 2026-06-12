// Preferences overlay: appearance mode (light/dark/system), accent theme, and
// a few stats over the decrypted in-memory entries. Everything here is
// device-local presentation state — mode and palette persist in localStorage
// and never sync (appearance is not content; the relay sees nothing).
import type { VNode } from 'preact';
import { useMemo } from 'preact/hooks';
import { Icon, type IconName } from './Icon';
import { useAppData } from '../state/data';
import { PALETTES, type ThemeControls, type ThemeMode } from '../hooks/useTheme';
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

export function PreferencesSheet({ desk, theme, onClose }: {
  desk: boolean;
  theme: ThemeControls;
  onClose: () => void;
}): VNode {
  const { entries } = useAppData();

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
