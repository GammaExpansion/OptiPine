import { useLayoutEffect, type RefObject } from 'react';
import type { Layout } from './layout.ts';
import { headerFitMarginPx, headerLayout } from './header-layout.ts';

/** The narrow workbench needs more room for platform font differences than the desktop. */
const narrowFitMarginPx = 24;

/**
 * Pick the least compact workbench header that fits its actual contents, including translated
 * status text and loaded fonts. Measure in one frame; never shrink the controls or reorder them.
 */
export function useHeaderFit(ref: RefObject<HTMLElement | null>, layout: Layout) {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header || layout === 'phone') return;
    let frame = 0;
    const fit = () => {
      if (!header.clientWidth) return;
      const narrow = layout === 'tablet';
      // Below 1024 the tablet already uses its short Run label and omits the timeframe.
      if (narrow && header.clientWidth < 1024) {
        delete header.dataset.narrow;
        return;
      }
      const margin = narrow ? narrowFitMarginPx : headerFitMarginPx;
      for (let level = 0; level <= (narrow ? 2 : 7); level++) {
        header.dataset[narrow ? 'narrow' : 'compact'] = String(level);
        const measured = headerLayout(header);
        // The spacer's expandable width is spare space; padding never needs to change.
        if (
          measured.scrollWidth <= measured.width &&
          measured.left >= measured.contentLeft &&
          measured.right <= measured.contentRight &&
          measured.gaps.every((gap) => gap >= 12) &&
          measured.slack >= margin
        )
          break;
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
      delete header.dataset.narrow;
    };
  }, [ref, layout]);
}
