import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { catalogs } from '../i18n/catalogs.ts';
import { Banner } from './Banner.tsx';
import { Button } from './Button.tsx';
import { EmptyState } from './EmptyState.tsx';
import { Icon, iconNames } from './Icon.tsx';
import { KeyValueRow } from './KeyValueRow.tsx';
import { Note } from './Note.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { SectionHeading } from './SectionHeading.tsx';
import { Table } from './Table.tsx';
import { Tag } from './Tag.tsx';

const { en } = catalogs;

test('progress reports bounded determinate values and omits a value for unknown progress', () => {
  const view = render(<ProgressBar label={en['sheet.optimizing']} value={62} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
  view.rerender(<ProgressBar label={en['sheet.optimizing']} value={200} max={50} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  view.rerender(<ProgressBar label={en['sheet.optimizing']} value={-5} max={0} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100');
  view.rerender(<ProgressBar label={en['sheet.optimizing']} value={NaN} />);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
});
test('all mock icons render with labels when meaningful and stay hidden when decorative', () => {
  const view = render(
    <>
      {iconNames.map((name) => (
        <Icon key={name} name={name} label={name} />
      ))}
    </>,
  );
  expect(screen.getAllByRole('img')).toHaveLength(iconNames.length);
  for (const name of iconNames)
    expect(screen.getByRole('img', { name })).toHaveAttribute('focusable', 'false');
  view.rerender(<Icon name="play" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
test('notes, banners and empty states expose caller copy and actions without changing it', () => {
  const action = vi.fn();
  render(
    <>
      <Note tone="danger" role="alert" icon={<Icon name="error" />}>
        {en['sheet.refusal']}
      </Note>
      <Banner
        title={en['sheet.staleTitle']}
        actions={<Button onClick={action}>{en['sheet.reset20']}</Button>}
      >
        {en['sheet.staleBody']}
      </Banner>
      <EmptyState
        title={en['sheet.empty']}
        actions={<Button onClick={action}>{en['sheet.destructive']}</Button>}
      >
        {en['sheet.emptyBody']}
      </EmptyState>
      <Tag tone="blue">{en['sheet.unsupported']}</Tag>
      <KeyValueRow label={en['sheet.initialCapital']}>{en['sheet.capital']}</KeyValueRow>
      <SectionHeading level={3} action={<Button>{en['sheet.reset']}</Button>}>
        {en['sheet.general']}
      </SectionHeading>
    </>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(en['sheet.refusal']);
  expect(screen.getByRole('heading', { name: en['sheet.empty'], level: 2 })).toBeVisible();
  expect(screen.getByRole('heading', { name: en['sheet.general'], level: 3 })).toBeVisible();
  expect(screen.getByText(en['sheet.capital'])).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: en['sheet.reset20'] }));
  fireEvent.click(screen.getByRole('button', { name: en['sheet.destructive'] }));
  expect(action).toHaveBeenCalledTimes(2);
});
test.each(['plain', 'leaderboard'] as const)(
  '%s tables preserve table semantics and a keyboard-scrollable region',
  (variant) => {
    render(
      <Table variant={variant} compact caption={en['sheet.leaderboard']}>
        <thead>
          <tr>
            <th scope="col">{en['sheet.rank']}</th>
          </tr>
        </thead>
        <tbody>
          <tr data-selected="true">
            <td>{1}</td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole('table')).toHaveAccessibleName(en['sheet.leaderboard']);
    expect(screen.getByRole('columnheader')).toHaveTextContent(en['sheet.rank']);
    expect(screen.getByRole('region')).toHaveAttribute('tabindex', '0');
  },
);
