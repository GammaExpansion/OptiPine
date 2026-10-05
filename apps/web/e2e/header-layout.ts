import { expect, type Page } from '@playwright/test';
import { headerFitMarginPx, headerLayout } from '../src/shell/header-layout.ts';

export { headerLayout };

/** Both first-launch and status sweeps enforce the padding edge and the full desktop gaps. */
export async function expectHeaderFits(page: Page) {
  const layout = await page.getByRole('banner').evaluate(headerLayout);
  expect.soft(layout.scrollWidth).toBe(layout.width);
  expect.soft(layout.left).toBeGreaterThanOrEqual(layout.contentLeft);
  expect.soft(layout.right).toBeLessThanOrEqual(layout.contentRight);
  for (const gap of layout.gaps) expect.soft(gap).toBeGreaterThanOrEqual(12);
  expect
    .soft(layout.slack, 'header slack after padding, controls and gaps')
    .toBeGreaterThanOrEqual(headerFitMarginPx);
  return layout;
}
