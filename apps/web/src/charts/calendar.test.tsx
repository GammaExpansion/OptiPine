import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { CalendarStrip } from './CalendarStrip.tsx';
import { MonthlyReturns } from './MonthlyReturns.tsx';
import { dayNumber } from './model.ts';
import type { CalendarHandle } from './svg.ts';

it('keeps SVG cells outside React, distinguishes missing bars, and provides keyboard values', () => {
  const ref = createRef<CalendarHandle>();
  const days = [
    { date: '2024-02-28', weekday: 3, pnl: 10, percent: 2 },
    { date: '2024-02-29', weekday: 4, pnl: null, percent: null },
  ];
  const tree = (unit: 'amount' | 'percent') => (
    <I18nProvider>
      <CalendarStrip days={days} unit={unit} ref={ref} />
    </I18nProvider>
  );
  const view = render(tree('amount'));
  const svg = screen.getByTestId('pnl-calendar');
  act(() =>
    ref.current!.render({
      width: 500,
      project: (day) => 28 + (day - dayNumber('2024-02-26')) * 10,
    }),
  );
  expect(svg.querySelectorAll('rect')).toHaveLength(2);
  expect(svg.querySelector('rect')!.getAttribute('width')).toBe('68.8');
  expect(svg.querySelectorAll('title')[1].textContent).toContain('No bars');
  fireEvent.focus(svg);
  fireEvent.keyDown(svg, { key: 'ArrowDown' });
  expect(svg).toHaveAccessibleName(/2024-02-29.*No bars/);
  view.rerender(tree('percent'));
  expect(svg.querySelector('title')).toHaveTextContent('2%');
  view.unmount();
});

it('positions monthly labels on the shared projection and preserves empty periods', () => {
  const ref = createRef<CalendarHandle>();
  const months = [
    { period: '2024-01', pnl: 100, percent: 1 },
    { period: '2024-02', pnl: null, percent: null },
  ];
  const view = render(
    <I18nProvider>
      <MonthlyReturns ref={ref} months={months} />
    </I18nProvider>,
  );
  act(() =>
    ref.current!.render({ width: 700, project: (day) => 28 + (day - dayNumber('2024-01-01')) * 8 }),
  );
  const svg = screen.getByRole('img');
  const labels = svg.querySelectorAll('svg > text');
  expect(labels[0].getAttribute('x')).toBe('124');
  expect(labels[1]).toHaveTextContent('—');
  view.unmount();
});
