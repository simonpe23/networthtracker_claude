import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Places a popover under (or above) its trigger using fixed positioning, so it is
 * never clipped by a scrolling dialog. It follows the trigger on scroll and resize
 * and closes on an outside press.
 */
export function usePopover(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  popover: RefObject<HTMLElement | null>,
  close: () => void,
  size: { width?: number; height: number },
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const place = (e?: Event) => {
      if (e && popover.current?.contains(e.target as Node)) return; // scrolling inside the list
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.max(size.width ?? 0, r.width);
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < size.height && above >= size.height;
      setStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        top: up ? undefined : r.bottom + 4,
        bottom: up ? window.innerHeight - r.top + 4 : undefined,
        width,
        maxHeight: Math.max(120, Math.min(size.height, up ? above : below)),
      });
    };
    // If it fits neither below nor above, scroll the page to make room below.
    const r0 = anchor.current?.getBoundingClientRect();
    if (r0) {
      const missing = size.height - (window.innerHeight - r0.bottom - 12);
      if (missing > 0 && r0.top - 12 < size.height) window.scrollBy(0, Math.min(missing, r0.top - 12));
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, popover, size.width, size.height]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || popover.current?.contains(t)) return;
      close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, anchor, popover, close]);

  return style;
}
