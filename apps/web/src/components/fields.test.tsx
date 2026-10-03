import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { catalogs } from '../i18n/catalogs.ts';
import { Checkbox } from './Checkbox.tsx';
import { FieldRow } from './FieldRow.tsx';
import { NumberField, type NumberFieldProps } from './NumberField.tsx';
import { TextInput } from './TextInput.tsx';
import { ToggleSwitch } from './ToggleSwitch.tsx';

const { en } = catalogs;

const labels = {
  label: en['sheet.numeric'],
  decrementLabel: en['sheet.decrease'],
  incrementLabel: en['sheet.increase'],
};
function NumberHarness(props: Partial<NumberFieldProps>) {
  const [value, setValue] = useState('0.25');
  return (
    <NumberField
      {...labels}
      value={value}
      onChange={setValue}
      min={0.25}
      max={5}
      step={0.25}
      {...props}
    />
  );
}
test('number arrows and pages honor step, min and max; controls work with Enter', async () => {
  const user = userEvent.setup();
  render(<NumberHarness />);
  const field = screen.getByRole('spinbutton');
  field.focus();
  await user.keyboard('{ArrowUp}{ArrowUp}');
  expect(field).toHaveValue('0.75');
  await user.keyboard('{PageUp}');
  expect(field).toHaveValue('3.25');
  await user.keyboard('{PageUp}');
  expect(field).toHaveValue('5');
  expect(screen.getByRole('button', { name: labels.incrementLabel })).toBeDisabled();
  await user.keyboard('{PageDown}{ArrowDown}');
  expect(field).toHaveValue('2.25');
  await user.keyboard('{PageDown}');
  expect(field).toHaveValue('0.25');
  expect(screen.getByRole('button', { name: labels.decrementLabel })).toBeDisabled();
  screen.getByRole('button', { name: labels.incrementLabel }).focus();
  await user.keyboard('{Enter}');
  expect(field).toHaveValue('0.5');
});
test('number field preserves invalid and empty drafts with associated error and default hint', async () => {
  const user = userEvent.setup();
  render(<NumberHarness hint={en['sheet.expression']} error={en['sheet.minimum']} />);
  const field = screen.getByRole('spinbutton');
  await user.clear(field);
  expect(field).toHaveValue('');
  expect(field).not.toHaveAttribute('aria-valuenow');
  await user.type(field, '-');
  expect(field).toHaveValue('-');
  expect(field).toHaveAccessibleDescription(`${en['sheet.expression']} ${en['sheet.minimum']}`);
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent(en['sheet.minimum']);
  await user.keyboard('{ArrowUp}');
  expect(field).toHaveValue('0.5');
});
test('read-only values have no steppers and disabled fields never emit edits', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const view = render(<NumberHarness readOnly onChange={onChange} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  screen.getByRole('spinbutton').focus();
  await user.keyboard('{ArrowUp}{PageDown}123');
  expect(onChange).not.toHaveBeenCalled();
  view.rerender(<NumberHarness disabled onChange={onChange} />);
  expect(screen.getByRole('spinbutton')).toBeDisabled();
  for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
});
test('field rows connect labels, hints and errors to native text/date controls', async () => {
  const user = userEvent.setup();
  const view = render(
    <FieldRow
      label={en['sheet.symbol']}
      hint={en['sheet.symbolPlaceholder']}
      error={en['sheet.searchEmpty']}
    >
      {(props) => <TextInput {...props} />}
    </FieldRow>,
  );
  const field = screen.getByRole('textbox', { name: en['sheet.symbol'] });
  expect(field).toHaveAccessibleDescription(
    `${en['sheet.symbolPlaceholder']} ${en['sheet.searchEmpty']}`,
  );
  expect(field).toHaveAttribute('aria-invalid', 'true');
  await user.type(field, 'BTC');
  expect(field).toHaveValue('BTC');
  view.rerender(
    <FieldRow label={en['sheet.startDate']} inline>
      {(props) => <TextInput {...props} type="date" defaultValue="2023-01-02" />}
    </FieldRow>,
  );
  expect(screen.getByLabelText(en['sheet.startDate'])).toHaveAttribute('type', 'date');
});
test('switches and checkboxes toggle by Space and indeterminate resolves to checked', async () => {
  const user = userEvent.setup();
  const switchChange = vi.fn();
  const checkChange = vi.fn();
  render(
    <>
      <ToggleSwitch label={en['sheet.switch']} onCheckedChange={switchChange} />
      <Checkbox
        label={en['sheet.checkbox']}
        defaultChecked="indeterminate"
        onCheckedChange={checkChange}
      />
      <Checkbox label={en['sheet.disabled']} disabled />
    </>,
  );
  screen.getByRole('switch').focus();
  await user.keyboard(' ');
  expect(screen.getByRole('switch')).toBeChecked();
  expect(switchChange).toHaveBeenLastCalledWith(true);
  screen.getByRole('checkbox', { name: en['sheet.checkbox'] }).focus();
  await user.keyboard(' ');
  expect(checkChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('checkbox', { name: en['sheet.checkbox'] })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: en['sheet.disabled'] })).toBeDisabled();
});
