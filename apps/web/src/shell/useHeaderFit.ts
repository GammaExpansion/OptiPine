import { useLayoutEffect, type RefObject } from 'react';
import type { Layout } from './layout.ts';

/** Four extra pixels at the right leave room for font-metric differences and rounding. */
const fitMarginPx = 4;

/** display: contents (the timeframe wrapper) contributes its children as flex items. */
function itemRects(parent: Element): DOMRect[] {
  return [...parent.children].flatMap((element) => {
    const style = getComputedStyle(element);
    if (style.display === 'contents') return itemRects(element);
    if (style.position === 'absolute' || style.position === 'fixed') return [];
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 1 ? [rect] : [];
  });
}

/**
 * Pick the least compact desktop header that fits its actual contents, including translated
 * status text and loaded fonts. Measure in one frame; never shrink the controls or reorder them.
 */
export function useHeaderFit(ref: RefObject<HTMLElement | null>, layout: Layout) {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header || layout !== 'desktop') return;
    let frame = 0;
    const fit = () => {
      if (!header.clientWidth) return;
      const style = getComputedStyle(header);
      const left = header.getBoundingClientRect().left + header.clientLeft;
      const contentLeft = left + parseFloat(style.paddingLeft);
      const contentRight = left + header.clientWidth - parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap);
      // The growing spacer consumes all spare width. Reserve the margin only while measuring,
      // then restore the designed padding before paint so a roomy header need not compact.
      const paddingRight = header.style.paddingRight;
      header.style.paddingRight = `${parseFloat(style.paddingRight) + fitMarginPx}px`;
      try {
        for (let level = 0; level <= 5; level++) {
          header.dataset.compact = String(level);
          const items = itemRects(header);
          // scrollWidth includes padding and misses collisions between flex items.
          if (
            header.scrollWidth <= header.clientWidth &&
            items.every(
              (rect, index) =>
                rect.left >= contentLeft &&
                rect.right <= contentRight - fitMarginPx &&
                (index === 0 || rect.left - items[index - 1].right >= gap),
            )
          )
            break;
        }
      } finally {
        header.style.paddingRight = paddingRight;
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(header);
    // A run changes only the status subtree; it need not rerender Header itself.
    const content = new MutationObserver(schedule);
    content.observe(header, { childList: true, characterData: true, subtree: true });
    document.fonts?.addEventListener('loadingdone', schedule);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      content.disconnect();
      document.fonts?.removeEventListener('loadingdone', schedule);
      delete header.dataset.compact;
    };
  }, [ref, layout]);
}
