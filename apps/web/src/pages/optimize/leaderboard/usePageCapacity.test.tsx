import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { usePageCapacity } from './usePageCapacity.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function geometry(phone = false) {
  vi.useFakeTimers();
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const body = document.createElement('div');
  body.innerHTML = phone
    ? '<ol><li></li><li></li></ol>'
    : '<div><table><thead></thead><tbody><tr></tr><tr></tr></tbody></table></div>';
  const dimensions = { height: 510, width: 600, row: 30, secondRow: 30, scrollbar: 0 };
  Object.defineProperties(body, {
    clientHeight: { get: () => dimensions.height },
    clientWidth: { get: () => dimensions.width },
  });
  for (const [index, row] of [...body.querySelectorAll(phone ? 'li' : 'tbody tr')].entries()) {
    row.getBoundingClientRect = () =>
      new DOMRect(
        0,
        0,
        100,
        Math.max(
          index ? dimensions.secondRow : dimensions.row,
          Number.parseFloat(body.style.getPropertyValue('--leaderboard-card-height')) || 0,
        ),
      );
  }
  if (!phone) {
    body.querySelector('thead')!.getBoundingClientRect = () => new DOMRect(0, 0, 600, 30);
    Object.defineProperties(body.firstElementChild!, {
      offsetHeight: { get: () => 400 + dimensions.scrollbar },
      clientHeight: { get: () => 400 },
    });
  }
  const onChange = vi.fn();
  const onMinimumHeight = vi.fn();
  const ref = { current: body };
  const rows: [] = [];
  const hook = renderHook(
    ({ key }) => usePageCapacity(ref, phone, rows, key, onChange, onMinimumHeight),
    {
      initialProps: { key: 'first-run' },
    },
  );
  const advance = (ms = 150) => act(() => vi.advanceTimersByTime(ms));
  return {
    body,
    dimensions,
    onChange,
    onMinimumHeight,
    hook,
    resize: () => resize(),
    advance,
    disconnect,
  };
}

test('subtracts the table header and scrollbar; a resize burst publishes one settled capacity', () => {
  const h = geometry();
  h.advance();
  expect(h.onChange.mock.calls).toEqual([[15]]);
  expect(h.onMinimumHeight).toHaveBeenLastCalledWith(181);
  h.onChange.mockClear();
  h.dimensions.height = 810;
  h.dimensions.scrollbar = 15;
  h.resize();
  h.advance(100);
  h.resize();
  h.advance(149);
  expect(h.onChange).not.toHaveBeenCalled();
  h.advance(1);
  expect(h.onChange.mock.calls).toEqual([[25]]);
  expect(h.onMinimumHeight).toHaveBeenLastCalledWith(196);
  h.resize();
  h.hook.unmount();
  h.advance();
  expect(h.disconnect).toHaveBeenCalledOnce();
  expect(h.onChange).toHaveBeenCalledOnce();
});

test('phone capacity uses the tallest card and releases its height on width or content changes', () => {
  const h = geometry(true);
  h.dimensions.height = 380;
  h.dimensions.row = 44;
  h.dimensions.secondRow = 60;
  h.advance();
  expect(h.onChange).toHaveBeenLastCalledWith(6);
  expect(h.body.style.getPropertyValue('--leaderboard-card-height')).toBe('60px');
  h.dimensions.secondRow = 44;
  h.resize();
  h.advance();
  expect(h.onChange).toHaveBeenLastCalledWith(6);
  h.dimensions.width = 700;
  h.resize();
  h.advance();
  expect(h.onChange).toHaveBeenLastCalledWith(8);
  h.dimensions.row = 70;
  h.resize();
  h.advance();
  expect(h.onChange).toHaveBeenLastCalledWith(5);
  h.dimensions.row = 44;
  h.hook.rerender({ key: 'second-run' });
  h.advance();
  expect(h.onChange).toHaveBeenLastCalledWith(8);
});

test('a hidden or empty panel cannot replace the last measured capacity', () => {
  const h = geometry();
  h.dimensions.height = 0;
  h.advance();
  expect(h.onChange).not.toHaveBeenCalled();
  h.dimensions.height = 500;
  h.body.querySelector('tbody')!.replaceChildren();
  h.resize();
  h.advance();
  expect(h.onChange).not.toHaveBeenCalled();
});
