import { useEffect, useState } from 'preact/hooks';

/** Subscribe to a CSS media query, re-rendering when it changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Wide screens get the desktop three-pane layout; narrow gets the mobile shell. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 920px)');
}
