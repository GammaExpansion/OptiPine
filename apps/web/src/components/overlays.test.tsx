import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, expect, test, vi } from 'vitest';
import { catalogs } from '../i18n/catalogs.ts';
import { Button } from './Button.tsx';
import { Combobox } from './Combobox.tsx';
import { Dialog, DialogClose } from './Dialog.tsx';
import { DropdownMenu } from './DropdownMenu.tsx';
import { Popover, PopoverClose } from './Popover.tsx';
import { Select } from './Select.tsx';
import { TextInput } from './TextInput.tsx';

const { en } = catalogs;

// These platform APIs have no jsdom layout implementation; browser tests cover positioning.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
test('grouped select opens by keyboard, skips disabled options and commits with Enter', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [value, setValue] = useState('net');
    return (
      <Select
        label={en['sheet.metric']}
        value={value}
        onChange={setValue}
        options={[
          {
            label: en['sheet.returns'],
            options: [
              { value: 'net', label: en['sheet.netProfit'] },
              { value: 'disabled', label: en['sheet.disabled'], disabled: true },
            ],
          },
          { label: en['sheet.risk'], options: [{ value: 'sharpe', label: en['sheet.sharpe'] }] },
        ]}
      />
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole('combobox');
  trigger.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('group', { name: en['sheet.returns'] })).toBeVisible();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(trigger).toHaveTextContent(en['sheet.sharpe']);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.keyboard('{Enter}{Escape}');
  expect(trigger).toHaveTextContent(en['sheet.sharpe']);
});
test('dialog traps focus, closes on Escape and returns focus to its trigger', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Button>{en['sheet.showToast']}</Button>
      <Dialog
        title={en['sheet.properties']}
        description={en['sheet.shared']}
        closeLabel={en['sheet.close']}
        trigger={<Button>{en['sheet.allSettings']}</Button>}
        footer={
          <DialogClose asChild>
            <Button>{en['sheet.cancel']}</Button>
          </DialogClose>
        }
      >
        <TextInput aria-label={en['sheet.length']} />
      </Dialog>
    </>,
  );
  const trigger = screen.getByRole('button', { name: en['sheet.allSettings'] });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveAccessibleName(en['sheet.properties']);
  expect(dialog).toHaveAccessibleDescription(en['sheet.shared']);
  const first = within(dialog).getByRole('button', { name: en['sheet.close'] });
  const last = within(dialog).getByRole('button', { name: en['sheet.cancel'] });
  expect(first).toHaveFocus();
  await user.tab({ shift: true });
  expect(last).toHaveFocus();
  await user.tab();
  expect(first).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('button', { name: en['sheet.cancel'] }));
  expect(trigger).toHaveFocus();
});
test('a dialog without description emits no missing-description warning and closes by its close button', async () => {
  const user = userEvent.setup();
  const warning = vi.spyOn(console, 'warn');
  render(
    <Dialog
      title={en['sheet.properties']}
      closeLabel={en['sheet.close']}
      trigger={<Button>{en['sheet.allSettings']}</Button>}
    >
      <p>{en['sheet.general']}</p>
    </Dialog>,
  );
  await user.click(screen.getByRole('button', { name: en['sheet.allSettings'] }));
  expect(warning).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: en['sheet.close'] }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a conditionally mounted dialog returns focus to an external opener without a Radix trigger', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>{en['sheet.allSettings']}</Button>
        {open && (
          <Dialog
            open
            onOpenChange={setOpen}
            title={en['sheet.properties']}
            closeLabel={en['sheet.close']}
          >
            <TextInput aria-label={en['sheet.length']} />
          </Dialog>
        )}
      </>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole('button', { name: en['sheet.allSettings'] });
  await user.tab();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: en['sheet.close'] })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(opener).toHaveFocus();
});
test('popover exposes content, dismisses outside and returns focus after Escape', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Button>{en['sheet.showToast']}</Button>
      <Popover
        label={en['sheet.condition']}
        trigger={<Button>{en['optimize.addCondition']}</Button>}
      >
        <PopoverClose asChild>
          <Button>{en['sheet.cancel']}</Button>
        </PopoverClose>
      </Popover>
    </>,
  );
  const trigger = screen.getByRole('button', { name: en['optimize.addCondition'] });
  await user.click(trigger);
  expect(screen.getByRole('dialog')).toHaveAccessibleName(en['sheet.condition']);
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: en['sheet.showToast'] }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('dropdown menu supports headings, separators, disabled items and keyboard selection', async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <DropdownMenu
      label={en['sheet.menu']}
      trigger={<Button>{en['sheet.menu']}</Button>}
      entries={[
        { id: 'heading', type: 'heading', label: en['sheet.values'] },
        { id: 'disabled', label: en['sheet.disabled'], disabled: true, onSelect: action },
        { id: 'copy', label: en['sheet.copyParameters'], onSelect: action },
        { id: 'separator', type: 'separator' },
        { id: 'delete', label: en['sheet.destructive'], tone: 'danger', onSelect: action },
      ]}
    />,
  );
  const trigger = screen.getByRole('button');
  trigger.focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menu')).toHaveAccessibleName(en['sheet.menu']);
  expect(screen.getByRole('menuitem', { name: en['sheet.copyParameters'] })).toHaveFocus();
  expect(screen.getByRole('separator')).toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
test('combobox filters by text, navigates suggestions, commits and cancels drafts', async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState('');
    return (
      <Combobox
        label={en['sheet.symbol']}
        emptyLabel={en['sheet.searchEmpty']}
        value={value}
        onChange={(next) => {
          setValue(next);
          changed(next);
        }}
        options={[
          { value: 'blocked', label: 'BTC', disabled: true },
          { value: 'BTCUSDT', label: en['sheet.btc'], detail: en['sheet.bitcoin'] },
          { value: 'other', label: en['sheet.yahoo'] },
        ]}
      />
    );
  }
  render(<Harness />);
  const input = screen.getByRole('combobox');
  await user.type(input, 'btc');
  expect(screen.getAllByRole('option')).toHaveLength(2);
  await user.keyboard('{ArrowDown}');
  expect(input).toHaveFocus();
  const activeId = input.getAttribute('aria-activedescendant');
  expect(document.getElementById(activeId!)).toHaveTextContent(en['sheet.btc']);
  await user.keyboard('{Enter}');
  expect(changed).toHaveBeenCalledWith('BTCUSDT');
  expect(input).toHaveValue(en['sheet.btc']);
  await user.clear(input);
  await user.type(input, 'zz');
  expect(screen.getByText(en['sheet.searchEmpty'])).toBeVisible();
  await user.keyboard('{Escape}');
  expect(input).toHaveValue(en['sheet.btc']);
  expect(input).toHaveAttribute('aria-expanded', 'false');
});
