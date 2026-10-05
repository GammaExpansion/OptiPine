import { expect, type Page } from '@playwright/test';

/** Measure actual flex items, including display: contents children, without hidden descriptions. */
export function headerLayout(header: HTMLElement) {
  const items = (parent: Element): DOMRect[] =>
    [...parent.children].flatMap((element) => {
      const style = getComputedStyle(element);
      if (style.display === 'contents') return items(element);
      if (style.position === 'absolute' || style.position === 'fixed') return [];
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 1 ? [rect] : [];
    });
  const children = items(header);
  const style = getComputedStyle(header);
  const left = header.getBoundingClientRect().left + header.clientLeft;
  return {
    width: header.clientWidth,
    scrollWidth: header.scrollWidth,
    contentLeft: left + parseFloat(style.paddingLeft),
    contentRight: left + header.clientWidth - parseFloat(style.paddingRight),
    left: Math.min(...children.map((rect) => rect.left)),
    right: Math.max(...children.map((rect) => rect.right)),
    gaps: children.slice(1).map((rect, index) => rect.left - children[index].right),
  };
}

/** Both first-launch and status sweeps enforce the padding edge and the full desktop gaps. */
export async function expectHeaderFits(page: Page) {
  const layout = await page.getByRole('banner').evaluate(headerLayout);
  expect.soft(layout.scrollWidth).toBe(layout.width);
  expect.soft(layout.left).toBeGreaterThanOrEqual(layout.contentLeft);
  expect.soft(layout.right).toBeLessThanOrEqual(layout.contentRight);
  for (const gap of layout.gaps) expect.soft(gap).toBeGreaterThanOrEqual(12);
  return layout;
}
