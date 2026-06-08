import type { VNode } from 'preact';

interface WordmarkProps {
  size?: number;
  color?: string;
  sub?: boolean;
}

export function Wordmark({ size = 26, color = 'var(--ink)', sub = false }: WordmarkProps): VNode {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="3.4" fill="var(--accent)" />
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeDasharray="2 3.2" opacity="0.35" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: size * 0.92, color, letterSpacing: 0.2 }}>Mneme</span>
        {sub && (
          <span style={{ fontFamily: 'var(--ui)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4 }}>
            encrypted journal
          </span>
        )}
      </span>
    </div>
  );
}
