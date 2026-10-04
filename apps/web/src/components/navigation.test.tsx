import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { catalogs } from '../i18n/catalogs.ts';
import { Chip } from './Chip.tsx';
import { ChipOverflow } from './ChipOverflow.tsx';
import { DockTabs } from './DockTabs.tsx';
import { PageTabs } from './PageTabs.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';
import { Tabs } from './Tabs.tsx';

const { en } = catalogs;

const options = [
  { value: 'one', label: en['optimize.none'] },
  { value: 'disabled', label: en['sheet.disabled'], disabled: true },
  { value: 'two', label: en['optimize.inOut'] },
  { value: 'three', label: en['optimize.walkForward'] },
];
test('segmented control roves focus, skips disabled items, wraps and retains selection', async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState('one');
    return (
      <SegmentedControl
        label={en['sheet.segment']}
        value={value}
        options={options}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Harness />);
  const group = screen.getByRole('radiogroup');
  const first = within(group).getByRole('radio', { name: en['optimize.none'] });
  first.focus();
  await user.keyboard('{ArrowRight} ');
  expect(within(group).getByRole('radio', { name: en['optimize.inOut'] })).toBeChecked();
  expect(changed).toHaveBeenLastCalledWith('two');
  await user.keyboard(' ');
  expect(changed).toHaveBeenCalledTimes(1);
  await user.keyboard('{End} ');
  expect(changed).toHaveBeenLastCalledWith('three');
  await user.keyboard('{ArrowRight} ');
  expect(changed).toHaveBeenLastCalledWith('one');
});
test('toggle chips expose pressed state and removable conditions have independent keyboard actions', async () => {
  const user = userEvent.setup();
  const remove = vi.fn();
  function Harness() {
    const [pressed, setPressed] = useState(false);
    return (
      <>
        <Chip label={en['sheet.closeValue']} pressed={pressed} onPressedChange={setPressed} />
        <Chip
          label={en['sheet.badFilter']}
          bad
          onRemove={remove}
          removeLabel={en['sheet.destructive']}
        />
        <Chip label={en['sheet.disabled']} disabled onClick={remove} />
      </>
    );
  }
  render(<Harness />);
  screen.getByRole('button', { name: en['sheet.closeValue'] }).focus();
  await user.keyboard(' ');
  expect(screen.getByRole('button', { name: en['sheet.closeValue'] })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: en['sheet.closeValue'] })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  screen.getByRole('button', { name: en['sheet.destructive'] }).focus();
  await user.keyboard('{Enter}');
  expect(remove).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: en['sheet.disabled'] })).toBeDisabled();
});
test('overflow chip opens the complete checkbox list and supports Escape with focus return', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [values, setValues] = useState(['one']);
    return (
      <ChipOverflow
        title={en['sheet.sourceValues']}
        options={options}
        values={values}
        onChange={setValues}
        limit={1}
        moreLabel={() => en['sheet.extra']}
        hint={en['sheet.fixedHint']}
      />
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: en['sheet.extra'] });
  trigger.focus();
  await user.keyboard('{Enter}');
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('checkbox', { name: en['optimize.none'] }));
  expect(screen.getByRole('button', { name: en['optimize.none'] })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(within(dialog).getByRole('checkbox', { name: en['sheet.disabled'] })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
test.each(['dock', 'provider'] as const)(
  '%s tabs select with arrows and link to the visible panel',
  async (kind) => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState('one');
      const Component = kind === 'dock' ? DockTabs : Tabs;
      return (
        <Component
          label={en['sheet.tabStates']}
          value={value}
          onChange={setValue}
          options={options}
        >
          {value}
        </Component>
      );
    }
    render(<Harness />);
    screen.getByRole('tab', { name: en['optimize.none'] }).focus();
    await user.keyboard('{ArrowRight}');
    const selected = screen.getByRole('tab', { name: en['optimize.inOut'] });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('two');
    expect(selected.getAttribute('aria-controls')).toBe(screen.getByRole('tabpanel').id);
  },
);
test('page navigation supports keyboard activation and disabled pages', async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  render(<PageTabs label={en['shell.pages']} value="one" onChange={changed} options={options} />);
  screen.getByRole('button', { name: en['optimize.inOut'] }).focus();
  await user.keyboard('{Enter}');
  expect(changed).toHaveBeenCalledWith('two');
  expect(screen.getByRole('button', { name: en['optimize.none'] })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('button', { name: en['sheet.disabled'] })).toBeDisabled();
});
