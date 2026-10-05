import { useLayoutEffect, type RefObject } from 'react';
import type { Layout } from './layout.ts';

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
      for (let level = 0; level <= 5; level++) {
        header.dataset.compact = String(level);
        if (header.scrollWidth <= header.clientWidth) break;
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
