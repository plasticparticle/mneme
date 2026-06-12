import { useCallback, useEffect, useState } from 'preact/hooks';
import { darken, hexA } from '../ui/color';

const MODE_KEY = 'mneme.theme.mode';
const PALETTE_KEY = 'mneme.theme.palette';
const LEGACY_DARK_KEY = 'mneme.theme.dark'; // pre-preferences boolean toggle

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemePalette {
  id: string;
  name: string;
  accent: string;
}

/** Accent themes over the warm-paper surfaces; the default terracotta first.
 * Muted, ink-compatible tones — the surface/ink ramp itself never changes. */
export const PALETTES: ThemePalette[] = [
  { id: 'terracotta', name: 'Terracotta', accent: '#B0563A' },
  { id: 'moss', name: 'Moss', accent: '#6F7D4D' },
  { id: 'sea', name: 'Sea', accent: '#3F7B82' },
  { id: 'twilight', name: 'Twilight', accent: '#5C6291' },
  { id: 'plum', name: 'Plum', accent: '#91527D' },
];

function initialMode(): ThemeMode {
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  const legacy = localStorage.getItem(LEGACY_DARK_KEY);
  if (legacy !== null) return legacy === '1' ? 'dark' : 'light';
  return 'system';
}

function initialPalette(): string {
  const stored = localStorage.getItem(PALETTE_KEY);
  return stored && PALETTES.some((p) => p.id === stored) ? stored : PALETTES[0].id;
}

export interface ThemeControls {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Resolved dark flag (mode + system preference). */
  dark: boolean;
  /** Quick toggle (sidebar moon): pins an explicit light/dark over 'system'. */
  toggleDark: () => void;
  palette: string;
  setPalette: (id: string) => void;
}

/**
 * Theme layer: light/dark/system mode + accent palette, persisted per device
 * in localStorage (appearance is not content — it never syncs). Mirrors the
 * design handoff's "tweaks" but keeps only the product-relevant bits; the
 * accent ramp is recomputed for dark (softer fills) like the prototype.
 */
export function useTheme(): ThemeControls {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [palette, setPaletteState] = useState<string>(initialPalette);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  // 'system' follows the OS live, not just at startup.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  const accent = (PALETTES.find((p) => p.id === palette) ?? PALETTES[0]).accent;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-ink', darken(accent, 0.16));
    root.style.setProperty('--accent-soft', hexA(accent, dark ? 0.2 : 0.12));
    root.style.setProperty('--accent-line', hexA(accent, 0.28));
  }, [dark, accent]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(MODE_KEY, m);
  }, []);

  const setPalette = useCallback((id: string) => {
    setPaletteState(id);
    localStorage.setItem(PALETTE_KEY, id);
  }, []);

  const toggleDark = useCallback(() => setMode(dark ? 'light' : 'dark'), [dark, setMode]);

  return { mode, setMode, dark, toggleDark, palette, setPalette };
}
