import { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useHeaderFit } from './useHeaderFit.ts';
import type { Layout } from './layout.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
});

test('measures the least compact fit again after width, content and font changes; disconnects', () => {
  vi.useFakeTimers();
  let width = 1280;
  let required = [1480, 1410, 1320, 1270, 1200, 1160];
  const stages: number[] = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    const stage = Number(this.dataset.compact);
    stages.push(stage);
    return required[stage];
  });
  let resize!: () => void;
  let mutation!: () => void;
  const disconnectResize = vi.fn();
  const disconnectMutation = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnectResize;
    },
  );
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: () => void) {
        mutation = callback;
      }
      observe() {}
      disconnect = disconnectMutation;
    },
  );
  const fonts = new EventTarget();
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  function Header({ layout }: { layout: Layout }) {
    const ref = useRef<HTMLElement>(null);
    useHeaderFit(ref, layout);
    return <header ref={ref} />;
  }
  const view = render(<Header layout="desktop" />);
  const header = view.container.firstElementChild!;
  expect(stages).toEqual([0, 1, 2, 3]);
  expect(header).toHaveAttribute('data-compact', '3');
  width = 1600;
  act(() => {
    resize();
    vi.advanceTimersByTime(20);
  });
  expect(header).toHaveAttribute('data-compact', '0');
  required = [1700, 1680, 1630, 1610, 1590, 1550];
  act(() => {
    mutation();
    vi.advanceTimersByTime(20);
  });
  expect(header).toHaveAttribute('data-compact', '4');
  required = [1750, 1730, 1700, 1660, 1620, 1580];
  act(() => {
    fonts.dispatchEvent(new Event('loadingdone'));
    vi.advanceTimersByTime(20);
  });
  expect(header).toHaveAttribute('data-compact', '5');
  view.rerender(<Header layout="phone" />);
  expect(header).not.toHaveAttribute('data-compact');
  expect(disconnectResize).toHaveBeenCalledOnce();
  expect(disconnectMutation).toHaveBeenCalledOnce();
});
