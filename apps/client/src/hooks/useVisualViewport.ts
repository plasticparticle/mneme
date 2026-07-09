import { useEffect, useState } from 'preact/hooks';

export interface ViewportRect {
  /** Height of the visible area — shrinks when the on-screen keyboard shows. */
  height: number;
  /** How far the visual viewport is offset from the top of the layout viewport. */
  offsetTop: number;
}

function read(): ViewportRect {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return vv
    ? { height: vv.height, offsetTop: vv.offsetTop }
    : { height: typeof window !== 'undefined' ? window.innerHeight : 0, offsetTop: 0 };
}

/**
 * Tracks the visual viewport so a bottom sheet can pin its input above the
 * on-screen keyboard. Android Chrome shrinks the *visual* viewport when the
 * keyboard opens but leaves the *layout* viewport (`height: 100%`, `inset: 0`)
 * full-height — so a normal bottom sheet keeps its input behind the keyboard and
 * the browser scrolls the whole sheet up to reveal it, hiding the header and the
 * latest messages. Sizing the overlay to this rect keeps it in the visible area.
 * Falls back to the layout viewport where the API is unavailable.
 */
export function useVisualViewport(): ViewportRect {
  const [rect, setRect] = useState<ViewportRect>(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = (): void => setRect(read());
    vv.addEventListener('resize', onChange);
    vv.addEventListener('scroll', onChange);
    return () => {
      vv.removeEventListener('resize', onChange);
      vv.removeEventListener('scroll', onChange);
    };
  }, []);
  return rect;
}
