import type { JSX, VNode, ComponentChildren } from 'preact';
import { Icon, type IconName } from './Icon';
import { hexA } from './color';
import { LABELS, type CoverPattern } from '../data/sample';

// ── Striped placeholder (for photos) ────────────────────────
interface PlaceholderProps {
  label?: string;
  h?: number;
  r?: number;
  style?: JSX.CSSProperties;
}
export function Placeholder({ label = 'photo', h = 160, r = 14, style = {} }: PlaceholderProps): VNode {
  return (
    <div
      style={{
        height: h, borderRadius: r, position: 'relative', overflow: 'hidden',
        background: 'repeating-linear-gradient(135deg, var(--ph-a) 0 11px, var(--ph-b) 11px 22px)',
        border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
          color: 'var(--ink-3)', background: 'var(--paper)', padding: '3px 9px', borderRadius: 6,
          border: '1px solid var(--line)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Button ──────────────────────────────────────────────────
type BtnKind = 'primary' | 'ghost' | 'soft' | 'quiet' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';
interface BtnProps {
  children?: ComponentChildren;
  kind?: BtnKind;
  size?: BtnSize;
  full?: boolean;
  onClick?: () => void;
  style?: JSX.CSSProperties;
  icon?: IconName;
}
export function Btn({ children, kind = 'primary', size = 'md', full, onClick, style = {}, icon }: BtnProps): VNode {
  const base: JSX.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'var(--ui)', fontWeight: 600, cursor: 'pointer', border: '1px solid transparent',
    borderRadius: 12, transition: 'all .15s ease', width: full ? '100%' : undefined, whiteSpace: 'nowrap',
    letterSpacing: 0.1,
  };
  const sizes: Record<BtnSize, JSX.CSSProperties> = {
    sm: { fontSize: 13, padding: '7px 12px', borderRadius: 10 },
    md: { fontSize: 15, padding: '11px 18px' },
    lg: { fontSize: 16, padding: '14px 22px', borderRadius: 14 },
  };
  const kinds: Record<BtnKind, JSX.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff', boxShadow: '0 1px 2px rgba(120,60,30,.25)' },
    ghost: { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)' },
    soft: { background: 'var(--accent-soft)', color: 'var(--accent-ink)' },
    quiet: { background: 'transparent', color: 'var(--ink-2)' },
    danger: { background: 'transparent', color: '#B0563A', border: '1px solid var(--line)' },
  };
  return (
    <button
      onClick={onClick}
      style={{ ...base, ...sizes[size], ...kinds[kind], ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(.97)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
}

// ── Label chip ──────────────────────────────────────────────
export function LabelChip({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' }): VNode | null {
  const L = LABELS[id];
  if (!L) return null;
  const s = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--ui)', fontSize: s ? 11.5 : 12.5, fontWeight: 600, letterSpacing: 0.1,
        color: L.color, background: hexA(L.color, 0.1), border: `1px solid ${hexA(L.color, 0.22)}`,
        padding: s ? '2px 8px' : '3px 10px', borderRadius: 999,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9, background: L.color }} />
      {L.name}
    </span>
  );
}

// ── Sync / encryption badge ─────────────────────────────────
export function SyncBadge({ compact }: { compact?: boolean }): VNode {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)',
      }}
      title="End-to-end encrypted · synced"
    >
      <Icon name="lock" size={14} color="var(--accent)" />
      {!compact && <span>Encrypted</span>}
    </span>
  );
}

// ── Journal cover swatch ────────────────────────────────────
export interface CoverSpec {
  color: string;
  cover: CoverPattern;
}
export function Cover({ journal, w = 44, h = 56, r = 8 }: { journal: CoverSpec; w?: number; h?: number; r?: number }): VNode {
  const c = journal.color;
  const patterns: Record<CoverPattern, string> = {
    lines: `repeating-linear-gradient(0deg, ${hexA(c, 0)} 0 7px, ${hexA(c, 0.16)} 7px 8px)`,
    dots: `radial-gradient(${hexA(c, 0.28)} 1.4px, transparent 1.5px)`,
    grid: `linear-gradient(${hexA(c, 0.16)} 1px, transparent 1px), linear-gradient(90deg, ${hexA(c, 0.16)} 1px, transparent 1px)`,
    plain: 'none',
    photo: `repeating-linear-gradient(135deg, ${hexA(c, 0.18)} 0 6px, ${hexA(c, 0.06)} 6px 12px)`,
  };
  const sizes: Partial<Record<CoverPattern, string>> = { dots: '9px 9px', grid: '9px 9px' };
  return (
    <div
      style={{
        width: w, height: h, borderRadius: r, flexShrink: 0, position: 'relative', overflow: 'hidden',
        background: hexA(c, 0.13), backgroundImage: patterns[journal.cover], backgroundSize: sizes[journal.cover],
        border: `1px solid ${hexA(c, 0.3)}`, boxShadow: 'inset 0 0 0 100px transparent',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: c, opacity: 0.85 }} />
    </div>
  );
}
