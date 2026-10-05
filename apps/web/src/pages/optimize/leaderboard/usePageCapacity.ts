import { useEffect, useRef, type RefObject } from 'react';
import {
  leaderboardRowsPerPage,
  minLeaderboardPageSize,
  type LeaderboardRow,
} from '../../../workflows/optimize-views.ts';

/** Wait for a pane drag to settle; live rankings still publish on their existing cadence. */
const resizeDelayMs = 150;

/**
 * Measure the body after its heading/footer and the table header have taken their space. Cards
 * may wrap, so use their tallest measured height and keep that height for this width/content
 * layout. Equal card heights keep page boundaries stable while browsing different sets.
 */
export function usePageCapacity(
  body: RefObject<HTMLDivElement | null>,
  phone: boolean,
  rows: readonly LeaderboardRow[],
  layoutKey: string,
  onChange: (pageSize: number) => void,
  onMinimumHeight?: (height: number) => void,
) {
  const cardHeight = useRef({ key: '', height: 0 });
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const height = element.clientHeight;
      if (!height || !element.clientWidth) return;
      const items = [...element.querySelectorAll<HTMLElement>(phone ? 'li' : 'tbody tr')];
      if (!items.length) return;
      const key = `${layoutKey}:${element.clientWidth}`;
      if (phone && key !== cardHeight.current.key) {
        cardHeight.current = { key, height: 0 };
        element.style.removeProperty('--leaderboard-card-height');
      }
      let rowHeight = Math.max(...items.map((row) => row.getBoundingClientRect().height));
      if (rowHeight <= 0) return;
      if (phone) {
        rowHeight = Math.max(cardHeight.current.height, rowHeight);
        cardHeight.current.height = rowHeight;
        element.style.setProperty('--leaderboard-card-height', `${rowHeight}px`);
      }
      const table = element.querySelector('table');
      const scroller = table?.parentElement;
      const header = table?.querySelector('thead')?.getBoundingClientRect().height ?? 0;
      const scrollbar = scroller ? scroller.offsetHeight - scroller.clientHeight : 0;
      // Collapsed table borders can extend by half a pixel beyond the measured rows.
      onChange(leaderboardRowsPerPage(height - header - scrollbar - (phone ? 0 : 1), rowHeight));
      if (!phone) {
        const chrome = (element.parentElement?.clientHeight ?? height) - height;
        onMinimumHeight?.(
          Math.ceil(chrome + header + scrollbar + 1 + minLeaderboardPageSize * rowHeight),
        );
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, resizeDelayMs);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    for (const row of element.querySelectorAll(phone ? 'li' : 'thead, tbody tr'))
      observer.observe(row);
    schedule();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [body, phone, rows, layoutKey, onChange, onMinimumHeight]);
}
