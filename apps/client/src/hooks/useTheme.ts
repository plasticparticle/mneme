import { useCallback, useEffect, useState } from 'preact/hooks';
import { darken, hexA } from '../ui/color';

const DARK_KEY = 'mneme.theme.dark';
const DEFAULT_ACCENT = '#B0563A';

function initialDark(): boolean {
  const stored = localStorage.getItem(DARK_KEY);
  if (stored !== null) return stored === '1';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Theme layer: dark-mode toggle + accent ramp.
 * Mirrors the design handoff's "tweaks" but keeps only the product-relevant bits;
 * the accent ramp is recomputed for dark (softer fills) like the prototype.
 */
export function useTheme(): { dark: boolean; toggleDark: () => void } {
  const [dark, setDark] = useState(initialDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', DEFAULT_ACCENT);
    root.style.setProperty('--accent-ink', darken(DEFAULT_ACCENT, 0.16));
    root.style.setProperty('--accent-soft', hexA(DEFAULT_ACCENT, dark ? 0.2 : 0.12));
    root.style.setProperty('--accent-line', hexA(DEFAULT_ACCENT, 0.28));
    localStorage.setItem(DARK_KEY, dark ? '1' : '0');
  }, [dark]);

  const toggleDark = useCallback(() => setDark((d) => !d), []);
  return { dark, toggleDark };
}
