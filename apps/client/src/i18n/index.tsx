// Client-side i18n. The English catalog under ./messages is the source of
// truth (its keys type every t() call); the other locales live in ./locales
// and lazy-load when picked, so they cost nothing until used. The chosen
// language is device-local localStorage like the theme — language is not
// content and never syncs. Arabic flips the whole document to RTL via
// <html dir="rtl">; layout must use logical CSS properties to follow.
import { createContext, type ComponentChildren, type VNode } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { en, type MessageKey } from './en';

export type { MessageKey } from './en';

const LOCALE_KEY = 'mneme.locale';

export interface LocaleInfo {
  id: string;
  /** Endonym shown in the switcher — a language is picked in itself. */
  name: string;
  /** English name; also used to tell the AI assistant what to reply in. */
  english: string;
  dir: 'ltr' | 'rtl';
}

export const LOCALES: LocaleInfo[] = [
  { id: 'en', name: 'English', english: 'English', dir: 'ltr' },
  { id: 'de', name: 'Deutsch', english: 'German', dir: 'ltr' },
  { id: 'fr', name: 'Français', english: 'French', dir: 'ltr' },
  { id: 'es', name: 'Español', english: 'Spanish', dir: 'ltr' },
  { id: 'it', name: 'Italiano', english: 'Italian', dir: 'ltr' },
  { id: 'nl', name: 'Nederlands', english: 'Dutch', dir: 'ltr' },
  { id: 'fi', name: 'Suomi', english: 'Finnish', dir: 'ltr' },
  { id: 'zh', name: '中文', english: 'Mandarin Chinese', dir: 'ltr' },
  { id: 'ja', name: '日本語', english: 'Japanese', dir: 'ltr' },
  { id: 'ko', name: '한국어', english: 'Korean', dir: 'ltr' },
  { id: 'hi', name: 'हिन्दी', english: 'Hindi', dir: 'ltr' },
  { id: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl' },
];

type Catalog = Partial<Record<MessageKey, string>>;

// Lazy per-locale catalogs. `import.meta.glob` is a Vite compile-time macro —
// Vite statically rewrites the call below into a map of dynamic importers, so
// it must be called UNCONDITIONALLY (a `typeof import.meta.glob` guard reads
// as 'undefined' at runtime and would silently disable every translation).
// The tsx repro scripts import UI modules outside the bundler, where the macro
// is a real absent property and the call throws — caught here so those scripts
// fall back to English-only, which is all they assert on.
let loaders: Record<string, () => Promise<unknown>> = {};
try {
  loaders = import.meta.glob('./locales/*.ts') as Record<string, () => Promise<unknown>>;
} catch {
  loaders = {};
}

let current: LocaleInfo = LOCALES[0];
let catalog: Catalog | null = null; // null = English (the compiled-in catalog)
const listeners = new Set<() => void>();

function applyDom(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current.id;
  document.documentElement.dir = current.dir;
}

export function currentLocale(): LocaleInfo {
  return current;
}

/** Translate a catalog key; `{name}` placeholders fill from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s: string = catalog?.[key] ?? en[key] ?? key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }
  return s;
}

type PluralBaseOf<K> = K extends `${infer B}#other` ? B : never;
/** Bases of keys that come in `#one`/`#other`… plural variants. */
export type PluralBase = PluralBaseOf<MessageKey>;

let plural: Intl.PluralRules | null = null;

/** Plural-aware t(): picks `base#<category>` per CLDR rules, `{count}` filled in. */
export function tp(base: PluralBase, count: number, params?: Record<string, string | number>): string {
  plural ??= new Intl.PluralRules(current.id);
  const exact = `${base}#${plural.select(count)}` as MessageKey;
  const key = (catalog?.[exact] ?? en[exact]) !== undefined ? exact : (`${base}#other` as MessageKey);
  return t(key, { count, ...params });
}

// ——— Locale-aware formatting (replaces the hardcoded English month arrays) ———

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const nfCache = new Map<string, Intl.NumberFormat>();

function dtf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = current.id + JSON.stringify(opts);
  let f = dtfCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(current.id, opts);
    dtfCache.set(k, f);
  }
  return f;
}

export function fmtDate(ts: number | Date, opts: Intl.DateTimeFormatOptions): string {
  return dtf(opts).format(ts);
}

export function fmtNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  const k = current.id + JSON.stringify(opts ?? {});
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(current.id, opts);
    nfCache.set(k, f);
  }
  return f.format(n);
}

/** Month name, `month` 0–11 like Date#getMonth(). */
export function monthName(month: number, style: 'long' | 'short' = 'long'): string {
  return fmtDate(Date.UTC(2024, month, 15), { month: style, timeZone: 'UTC' });
}

/** Weekday name, `day` 0=Sunday like Date#getDay(). */
export function weekdayName(day: number, style: 'long' | 'short' | 'narrow' = 'short'): string {
  // 2024-06-02 was a Sunday.
  return fmtDate(Date.UTC(2024, 5, 2 + day), { weekday: style, timeZone: 'UTC' });
}

// ——— Switching ———

export async function setLocale(id: string): Promise<void> {
  const info = LOCALES.find((l) => l.id === id) ?? LOCALES[0];
  let next: Catalog | null = null;
  if (info.id !== 'en') {
    const load = loaders[`./locales/${info.id}.ts`];
    if (load) next = ((await load()) as { default: Catalog }).default;
  }
  current = info;
  catalog = next;
  plural = null;
  try {
    localStorage.setItem(LOCALE_KEY, info.id);
  } catch {
    // storage unavailable (private mode / scripts) — keep the in-memory choice
  }
  applyDom();
  listeners.forEach((fn) => fn());
}

/** Restore the persisted language before first render (no flash of English). */
export async function initI18n(): Promise<void> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LOCALE_KEY);
  } catch {
    stored = null;
  }
  if (stored && stored !== 'en' && LOCALES.some((l) => l.id === stored)) {
    await setLocale(stored);
  } else {
    applyDom();
  }
}

// ——— Preact wiring ———

export interface I18n {
  t: typeof t;
  tp: typeof tp;
  locale: string;
  dir: 'ltr' | 'rtl';
  locales: LocaleInfo[];
  setLocale: (id: string) => Promise<void>;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * Mount once above the app. Components normally just import the bare t()/tp()
 * — the subscriber at the root (main.tsx Root) re-renders the whole tree on a
 * locale change, so module-level reads stay fresh. useI18n() is for the
 * switcher itself and anything that needs `locale`/`dir`.
 */
export function I18nProvider({ children }: { children: ComponentChildren }): VNode {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = (): void => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const value = useMemo<I18n>(
    () => ({ t, tp, locale: current.id, dir: current.dir, locales: LOCALES, setLocale }),
    [tick],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n() outside <I18nProvider>');
  return v;
}
