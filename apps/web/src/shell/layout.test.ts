import { expect, test, vi } from 'vitest';
import { currentLayout, layoutOf, layoutQueries, watchLayout } from './layout.ts';

/** A `matchMedia` for a viewport `width` px wide that answers the layout queries. */
const viewport = (width: number) => (query: string) => ({
  matches: width <= Number(/(\d+)px/.exec(query)![1]),
});

test('the width picks the layout: desktop from 1280 px, tablet from 768 px, phone below', () => {
  expect(layoutOf({ phone: false, tablet: false })).toBe('desktop');
  expect(layoutOf({ phone: false, tablet: true })).toBe('tablet');
  expect(layoutOf({ phone: true, tablet: true })).toBe('phone');
  expect(
    [1440, 1280, 1279, 1024, 768, 767, 390].map((width) => currentLayout(viewport(width))),
  ).toEqual(['desktop', 'desktop', 'tablet', 'tablet', 'tablet', 'phone', 'phone']);
});

test('without matchMedia, as in Node, the page lays out as on a desktop', () => {
  expect(currentLayout(undefined)).toBe('desktop');
  expect(watchLayout(() => {}, undefined)()).toBeUndefined();
});

test('the layout is watched through both queries until the watch stops', () => {
  const lists = new Map<string, EventTarget>();
  const matchMedia = (query: string) => {
    const list = new EventTarget();
    lists.set(query, list);
    return list as MediaQueryList;
  };
  const listener = vi.fn();
  const stop = watchLayout(listener, matchMedia);
  expect([...lists.keys()]).toEqual([layoutQueries.phone, layoutQueries.tablet]);
  lists.get(layoutQueries.tablet)!.dispatchEvent(new Event('change'));
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  lists.get(layoutQueries.phone)!.dispatchEvent(new Event('change'));
  expect(listener).toHaveBeenCalledTimes(1);
});
