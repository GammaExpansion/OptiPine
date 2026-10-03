import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { en } from '../i18n/en.ts';
import { Button } from './Button.tsx';
import { IconButton } from './IconButton.tsx';
import { ToastProvider, useToast } from './Toast.tsx';
import { Tooltip } from './Tooltip.tsx';

afterEach(() => vi.useRealTimers());
test('disabled reason is available on keyboard focus, while clicks and keys remain inert', async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <Button variant="primary" disabled disabledReason={en['shell.runMissing']} onClick={action}>
      {en['shell.runBacktest']}
    </Button>,
  );
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(en['shell.runMissing']);
  await user.tab();
  expect(button.parentElement).toHaveFocus();
  expect(screen.getByRole('tooltip')).toHaveTextContent(en['shell.runMissing']);
  await user.keyboard('{Enter} ');
  fireEvent.click(button);
  expect(action).not.toHaveBeenCalled();
});
test('aria-disabled and loading buttons suppress activation and retain labels', async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <>
      <Button aria-disabled onClick={action}>
        {en['sheet.disabled']}
      </Button>
      <Button loading onClick={action}>
        {en['sheet.loading']}
      </Button>
      <IconButton
        icon="download"
        label={en['sheet.icon.download']}
        disabled
        disabledReason={en['shell.runMissing']}
        onClick={action}
      />
    </>,
  );
  await user.click(screen.getByRole('button', { name: en['sheet.disabled'] }));
  expect(action).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: en['sheet.loading'] })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(screen.getByRole('button', { name: en['sheet.loading'] })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: en['sheet.icon.download'] }),
  ).toHaveAccessibleDescription(en['shell.runMissing']);
});
test('tooltip opens on focus and Escape dismisses without activating the trigger', async () => {
  const user = userEvent.setup();
  render(
    <Tooltip content={en['sheet.fixedHint']}>
      <Button>{en['sheet.expression']}</Button>
    </Tooltip>,
  );
  await user.tab();
  expect(screen.getByRole('tooltip')).toHaveTextContent(en['sheet.fixedHint']);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
function ToastHarness({ action }: { action: () => void }) {
  const queue = useToast();
  return (
    <>
      <Button
        onClick={() => {
          queue.push({ message: en['sheet.copied'] });
          queue.push({ message: en['sheet.exported'] });
        }}
      >
        {en['sheet.showToast']}
      </Button>
      <Button
        onClick={() =>
          queue.push({
            message: en['sheet.applied'],
            action: { label: en['sheet.undo'], altText: en['sheet.undoHint'], onClick: action },
          })
        }
      >
        {en['sheet.showActionToast']}
      </Button>
    </>
  );
}
function renderToasts(action = vi.fn()) {
  render(
    <ToastProvider label={en['sheet.toastRegion']} closeLabel={en['sheet.close']} duration={1000}>
      <ToastHarness action={action} />
    </ToastProvider>,
  );
}
test('toast queue delivers one at a time and automatically advances after its duration', async () => {
  vi.useFakeTimers();
  renderToasts();
  fireEvent.click(screen.getByRole('button', { name: en['sheet.showToast'] }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(screen.getByText(en['sheet.copied'])).toBeVisible();
  expect(screen.queryByText(en['sheet.exported'])).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.queryByText(en['sheet.copied'])).not.toBeInTheDocument();
  expect(screen.getByText(en['sheet.exported'])).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(screen.queryByText(en['sheet.exported'])).not.toBeInTheDocument();
});
test('action toasts persist, execute the action once and can be dismissed explicitly', async () => {
  vi.useFakeTimers();
  const action = vi.fn();
  renderToasts(action);
  fireEvent.click(screen.getByRole('button', { name: en['sheet.showActionToast'] }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(screen.getByText(en['sheet.applied'])).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: en['sheet.undo'] }));
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(en['sheet.applied'])).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: en['sheet.showActionToast'] }));
  const region = screen.getByRole('region', { name: en['sheet.toastRegion'] });
  fireEvent.click(within(region).getByRole('button', { name: en['sheet.close'] }));
  expect(screen.queryByText(en['sheet.applied'])).not.toBeInTheDocument();
  expect(action).toHaveBeenCalledTimes(1);
});

test('reading a toast pauses expiry and leaving resumes the remaining duration', async () => {
  vi.useFakeTimers();
  renderToasts();
  fireEvent.click(screen.getByRole('button', { name: en['sheet.showToast'] }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  const region = screen.getByRole('region', { name: en['sheet.toastRegion'] });
  fireEvent.pointerMove(region);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByText(en['sheet.copied'])).toBeVisible();
  fireEvent.pointerLeave(region);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(850);
  });
  expect(screen.queryByText(en['sheet.copied'])).not.toBeInTheDocument();
  expect(screen.getByText(en['sheet.exported'])).toBeVisible();
});
