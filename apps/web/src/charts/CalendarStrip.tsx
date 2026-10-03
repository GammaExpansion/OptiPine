import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { DailyPnl } from '../workflows/equity.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatNumber } from '../i18n/translate.ts';
import { calendarLayout } from './model.ts';
import { svgElement, type CalendarHandle, type CalendarViewport } from './svg.ts';
import styles from './Charts.module.css';

export interface CalendarStripProps {
  days: readonly DailyPnl[];
  unit: 'amount' | 'percent';
}

export const CalendarStrip = forwardRef<CalendarHandle, CalendarStripProps>(function CalendarStrip(
  { days, unit },
  ref,
) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const draw = useRef<(viewport: CalendarViewport) => void>(() => {});
  const viewport = useRef<CalendarViewport | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      render(value) {
        viewport.current = value;
        draw.current(value);
      },
    }),
    [],
  );
  useEffect(() => {
    const root = svg.current!;
    root.replaceChildren();
    const layout = calendarLayout(days);
    const values = days.map((day) => (unit === 'amount' ? day.pnl : day.percent));
    const maximum = values.reduce<number>((max, value) => Math.max(max, Math.abs(value ?? 0)), 0);
    const group = svgElement('svg', { x: 28, y: 0, height: 65, overflow: 'hidden' });
    root.append(group);
    const descriptions: string[] = [];
    const cells = layout.cells.map((day, index) => {
      const value = values[index];
      const label = t('charts.dayValue', {
        date: day.date,
        value:
          value === null
            ? t('charts.noData')
            : unit === 'percent'
              ? t('charts.percent', { value: formatNumber(value, { maximumFractionDigits: 2 }) })
              : formatNumber(value, { maximumFractionDigits: 2 }),
      });
      descriptions.push(label);
      const rect = svgElement('rect', {
        y: day.row * 9 + 1,
        height: 7.8,
        rx: 1,
        fill:
          value === null || value === 0
            ? 'var(--hover)'
            : value > 0
              ? 'var(--profit)'
              : 'var(--loss)',
        'fill-opacity':
          value === null || value === 0
            ? 1
            : 0.22 + Math.min(1, Math.abs(value) / (maximum || 1)) * 0.73,
      });
      rect.append(svgElement('title', {}, label));
      group.append(rect);
      return rect;
    });
    for (const [row, id] of [
      [0, 'charts.mon'],
      [2, 'charts.wed'],
      [4, 'charts.fri'],
      [6, 'charts.sun'],
    ] as const) {
      root.append(
        svgElement(
          'text',
          { x: 23, y: row * 9 + 8, 'text-anchor': 'end', fill: 'var(--caption)', 'font-size': 9 },
          t(id),
        ),
      );
    }
    const axisLabel = svgElement(
      'text',
      { y: 12, fill: 'var(--secondary)', 'font-size': 11 },
      t('charts.dailyPnl'),
    );
    root.append(axisLabel);
    let selected = -1;
    const select = (index: number) => {
      cells[selected]?.removeAttribute('stroke');
      selected = Math.max(0, Math.min(cells.length - 1, index));
      cells[selected]?.setAttribute('stroke', 'var(--text)');
      root.setAttribute(
        'aria-label',
        `${t('charts.calendarKeyboard')} ${descriptions[selected] ?? ''}`,
      );
    };
    const keyboard = (event: KeyboardEvent) => {
      let index = selected < 0 ? 0 : selected;
      if (event.key === 'ArrowRight') index += 7;
      else if (event.key === 'ArrowLeft') index -= 7;
      else if (event.key === 'ArrowDown') index++;
      else if (event.key === 'ArrowUp') index--;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = cells.length - 1;
      else return;
      event.preventDefault();
      select(index);
    };
    const focus = () => {
      if (selected < 0) select(0);
    };
    root.addEventListener('keydown', keyboard);
    root.addEventListener('focus', focus);
    draw.current = ({ width, project }) => {
      root.setAttribute('viewBox', `0 0 ${width} 65`);
      group.setAttribute('width', String(Math.max(0, width - 104)));
      axisLabel.setAttribute('x', String(width - 66));
      layout.cells.forEach((day, index) => {
        const left = project(day.monday);
        const right = project(day.monday + 7);
        cells[index].setAttribute('x', String(left - 28 + 0.5));
        cells[index].setAttribute('width', String(Math.max(0.5, right - left - 1.2)));
      });
    };
    if (viewport.current) draw.current(viewport.current);
    return () => {
      root.removeEventListener('keydown', keyboard);
      root.removeEventListener('focus', focus);
      draw.current = () => {};
    };
  }, [days, unit, t]);
  return (
    <svg
      className={styles.calendar}
      ref={svg}
      role="group"
      tabIndex={0}
      aria-label={t('charts.calendarKeyboard')}
      data-testid="pnl-calendar"
    />
  );
});
