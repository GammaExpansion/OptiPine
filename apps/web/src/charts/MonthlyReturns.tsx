import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { PeriodReturn } from '../workflows/equity.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatNumber } from '../i18n/translate.ts';
import { monthlyBuckets, dayNumber } from './model.ts';
import { svgElement, type CalendarHandle, type CalendarViewport } from './svg.ts';
import styles from './Charts.module.css';

export interface MonthlyReturnsProps {
  months: readonly PeriodReturn[];
  yearly?: readonly PeriodReturn[];
}
export const MonthlyReturns = forwardRef<CalendarHandle, MonthlyReturnsProps>(
  function MonthlyReturns({ months, yearly = [] }, ref) {
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
      const group = svgElement('svg', { x: 28, height: 43, overflow: 'hidden' });
      root.append(group);
      const buckets = monthlyBuckets(months);
      const label = (value: number | null) =>
        value === null ? t('charts.na') : formatNumber(value, { maximumFractionDigits: 1 });
      const labels = buckets.map((month) => {
        const color =
          month.percent === null
            ? 'var(--caption)'
            : month.percent >= 0
              ? 'var(--profit)'
              : 'var(--loss)';
        const element = svgElement(
          'text',
          { y: 13, fill: color, 'font-size': 10, 'text-anchor': 'middle' },
          label(month.percent),
        );
        element.append(
          svgElement(
            'title',
            {},
            t('charts.monthValue', { month: month.period, value: label(month.percent) }),
          ),
        );
        group.append(element);
        return element;
      });
      const years = yearly.map((year) => {
        const element = svgElement(
          'text',
          { y: 32, fill: 'var(--secondary)', 'font-size': 11 },
          t('charts.yearValue', { year: year.period, value: label(year.percent) }),
        );
        group.append(element);
        return element;
      });
      const axis = svgElement(
        'text',
        { y: 13, fill: 'var(--caption)', 'font-size': 10.5 },
        t('charts.monthPercent'),
      );
      root.append(axis);
      draw.current = ({ width, project }) => {
        root.setAttribute('viewBox', `0 0 ${width} 43`);
        group.setAttribute('width', String(Math.max(0, width - 104)));
        axis.setAttribute('x', String(width - 66));
        buckets.forEach((month, index) => {
          const left = Math.max(28, project(month.from));
          const right = Math.min(width - 76, project(month.to));
          labels[index].setAttribute('x', String((left + right) / 2 - 28));
          labels[index].setAttribute('visibility', right - left >= 24 ? 'visible' : 'hidden');
        });
        yearly.forEach((year, index) => {
          const left = project(dayNumber(`${year.period}-01-01`));
          const right = project(dayNumber(`${Number(year.period) + 1}-01-01`));
          years[index].setAttribute('x', String(Math.max(28, left) - 24));
          years[index].setAttribute(
            'visibility',
            right > 28 && left < width - 76 ? 'visible' : 'hidden',
          );
        });
      };
      if (viewport.current) draw.current(viewport.current);
      return () => {
        draw.current = () => {};
      };
    }, [months, yearly, t]);
    return (
      <svg className={styles.months} ref={svg} role="img" aria-label={t('charts.monthlyReturns')} />
    );
  },
);
