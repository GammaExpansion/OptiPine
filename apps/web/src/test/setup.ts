import type {} from '@testing-library/jest-dom/vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';
// Components render in either language at once; the app loads one catalog at a time.
import '../i18n/catalogs.ts';

expect.extend(matchers);
afterEach(cleanup);
// Layout is checked in Chromium; jsdom only needs the observation lifecycle for shell behavior.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
// CodeMirror measures text through ranges, which jsdom does not lay out. Node-environment
// suites have no DOM at all.
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  });
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}
