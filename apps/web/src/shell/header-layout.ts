/** The production fit and browser assertions must require the same spare width. */
export const headerFitMarginPx = 4;

/** Measure actual flex items, including display: contents children, without hidden descriptions. */
export function headerLayout(header: HTMLElement) {
  const items = (parent: Element): { rect: DOMRect; grow: boolean; fullRow: boolean }[] =>
    [...parent.children].flatMap((element) => {
      const style = getComputedStyle(element);
      if (style.display === 'contents') return items(element);
      if (style.position === 'absolute' || style.position === 'fixed') return [];
      const rect = element.getBoundingClientRect();
      const grow = Number(style.flexGrow) > 0;
      return style.display !== 'none' && (grow || (rect.width > 0 && rect.height > 1))
        ? [{ rect, grow, fullRow: style.flexBasis === '100%' }]
        : [];
    });
  const children = items(header);
  const style = getComputedStyle(header);
  const left = header.getBoundingClientRect().left + header.clientLeft;
  const contentLeft = left + parseFloat(style.paddingLeft);
  const contentRight = left + header.clientWidth - parseFloat(style.paddingRight);
  // Wrapped progress/errors use a separate full-width line; slack concerns the controls row.
  const row = children.filter((item) => !item.fullRow);
  return {
    width: header.clientWidth,
    scrollWidth: header.scrollWidth,
    contentLeft,
    contentRight,
    left: Math.min(...children.map(({ rect }) => rect.left)),
    right: Math.max(...children.map(({ rect }) => rect.right)),
    gaps: row.slice(1).map(({ rect }, index) => rect.left - row[index].rect.right),
    slack:
      contentRight -
      contentLeft -
      row.reduce((sum, item) => sum + (item.grow ? 0 : item.rect.width), 0) -
      Math.max(0, row.length - 1) * parseFloat(style.columnGap),
  };
}
