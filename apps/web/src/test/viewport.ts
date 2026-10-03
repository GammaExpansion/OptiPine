import { afterEach } from 'vitest';

/** One media query list of the mock, answering `(max-width: Npx)` for the current width. */
class MockMediaQueryList extends EventTarget {
  readonly media: string;
  readonly #width: () => number;
  onchange = null;
  constructor(media: string, width: () => number) {
    super();
    this.media = media;
    this.#width = width;
  }
  get matches(): boolean {
    const max = /max-width:\s*(\d+)px/.exec(this.media);
    return max ? this.#width() <= Number(max[1]) : false;
  }
  addListener(listener: (event: Event) => void) {
    this.addEventListener('change', listener);
  }
  removeListener(listener: (event: Event) => void) {
    this.removeEventListener('change', listener);
  }
}

let lists: MockMediaQueryList[] = [];
let width = 1440;

/**
 * Give jsdom a `matchMedia` for a viewport `pixels` wide; calling it again resizes the viewport
 * and tells the lists whose answer changed. The mock goes away after each test.
 */
export function setViewportWidth(pixels: number): void {
  const before = lists.map((list) => list.matches);
  width = pixels;
  window.matchMedia ??= (media: string) => {
    const list = new MockMediaQueryList(media, () => width);
    lists.push(list);
    return list as unknown as MediaQueryList;
  };
  lists.forEach((list, index) => {
    if (list.matches !== before[index]) list.dispatchEvent(new Event('change'));
  });
}

afterEach(() => {
  lists = [];
  width = 1440;
  Reflect.deleteProperty(window, 'matchMedia');
});
