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

test.each(['padding', 'gap', 'offset'] as const)(
  'compacts when %s fails even though scrollWidth equals clientWidth',
  (reason) => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const origin = reason === 'offset' ? 102 : 0;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1440);
    vi.spyOn(HTMLElement.prototype, 'clientLeft', 'get').mockReturnValue(origin ? 2 : 0);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const stage = Number(this.closest('header')?.dataset.compact);
      if (this.tagName === 'HEADER') return new DOMRect(origin ? 100 : 0, 0, 1440, 48);
      if (this.dataset.item === 'first') return new DOMRect(origin + 16, 8, 100, 32);
      if (this.dataset.item === 'last') {
        const right = reason === 'gap' ? 1400 : [1432, 1428, 1424][Math.min(stage, 2)];
        const left = reason === 'gap' ? [110, 127.75, 128][Math.min(stage, 2)] : 128;
        return new DOMRect(origin + left, 8, right - left, 32);
      }
      // The progress line and an assistive-only description never consume flex-row space.
      return this.dataset.item === 'hidden' ? new DOMRect(0, 0, 1, 1) : new DOMRect(0, 0, 1440, 2);
    });
    function Header() {
      const ref = useRef<HTMLElement>(null);
      useHeaderFit(ref, 'desktop');
      return (
        <header ref={ref} style={{ paddingLeft: 16, paddingRight: 12, columnGap: 12 }}>
          <div data-item="first" />
          <span style={{ display: 'contents' }}>
            <div data-item="last" />
          </span>
          <div style={{ position: 'absolute' }} />
          <div data-item="hidden" />
        </header>
      );
    }
    const view = render(<Header />);
    expect(view.container.firstElementChild).toHaveAttribute('data-compact', '2');
    expect(view.container.firstElementChild).toHaveStyle({ paddingRight: '12px' });
  },
);

test('measures the least compact fit again after width, content and font changes; disconnects', () => {
  vi.useFakeTimers();
  let width = 1280;
  let required = [1480, 1410, 1320, 1270, 1200, 1160];
  const stages: number[] = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName === 'HEADER') return new DOMRect(0, 0, width, 48);
    // Like the flex spacer, keep the last item against the current padding edge.
    const padding = parseFloat(getComputedStyle(this.closest('header')!).paddingRight);
    expect(padding).toBe(16);
    return new DOMRect(width - padding - 32, 8, 32, 32);
  });
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
    return (
      <header ref={ref} style={{ paddingLeft: 16, paddingRight: 12, columnGap: 12 }}>
        <button />
      </header>
    );
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
  expect(header).toHaveStyle({ paddingRight: '12px' });
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

test.each([1, 2])('the narrow workbench reserves 24 px using step %s only when needed', (step) => {
  vi.useFakeTimers();
  let width = 1024;
  let resize!: () => void;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName === 'HEADER') return new DOMRect(0, 0, width, 80);
    const header = this.closest('header')!;
    expect(getComputedStyle(header).paddingRight).toBe('32px');
    const required = step === 1 ? [1010, 960, 920] : [1045, 985, 945];
    return new DOMRect(14, 8, required[Number(header.dataset.narrow)], 32);
  });
  function Header() {
    const ref = useRef<HTMLElement>(null);
    useHeaderFit(ref, 'tablet');
    return (
      <header ref={ref} style={{ paddingLeft: 14, paddingRight: 8, columnGap: 12 }}>
        <button />
        <div style={{ flexBasis: '100%' }} />
      </header>
    );
  }
  const view = render(<Header />);
  const header = view.container.firstElementChild!;
  expect(header).toHaveAttribute('data-narrow', String(step));
  expect(header).toHaveStyle({ paddingRight: '8px' });
  width = 1180;
  act(() => {
    resize();
    vi.advanceTimersByTime(20);
  });
  expect(header).toHaveAttribute('data-narrow', '0');
  width = 900;
  act(() => {
    resize();
    vi.advanceTimersByTime(20);
  });
  expect(header).not.toHaveAttribute('data-narrow');
});
