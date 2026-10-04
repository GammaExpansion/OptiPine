import { render } from '@testing-library/react';
import { prepareHeatmap, type Heatmap } from '@pine/optimizer';
import { expect, it } from 'vitest';
import { LegendRamp, legendValue } from './LegendRamp.tsx';

const scaled = (values: readonly number[], scale: Heatmap['scale']) =>
  prepareHeatmap({ xKey: 'X', cells: values.map((value, x) => ({ x, value, count: 1 })), scale });

it('writes the ends short without rounding small values away (R4)', () => {
  expect([2423.16, -4210, 272.455, 0.0315, 0].map(legendValue)).toEqual([
    '2.4K',
    '-4.2K',
    '272',
    '0.0315',
    '0',
  ]);
});

it('runs from the worst value to the best, labelling the break-even between the sides', () => {
  const ramp = (map: Heatmap) => {
    const { container } = render(<LegendRamp map={map} className="ramp" missing="—" />);
    return {
      ends: [...container.querySelectorAll(':scope > span')].map((end) => end.textContent),
      steps: container.querySelectorAll('.ramp i').length,
      label: container.querySelector('.ramp span')?.textContent ?? null,
    };
  };
  expect(ramp(scaled([-20, 5, 300], { direction: 'maximize', breakEven: 0 }))).toEqual({
    ends: ['-20', '300'],
    steps: 9,
    label: '0',
  });
  expect(ramp(scaled([0.4, 0.1], { direction: 'minimize' }))).toEqual({
    ends: ['0.4', '0.1'],
    steps: 9,
    label: null,
  });
  expect(ramp(scaled([1.2, 2], { direction: 'maximize', breakEven: 1 }))).toEqual({
    ends: ['1.2', '2'],
    steps: 5,
    label: null,
  });
});
