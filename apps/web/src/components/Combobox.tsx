import { useEffect, useId, useState } from 'react';
import * as Primitive from '@radix-ui/react-popover';
import { Icon } from './Icon.tsx';
import { TextInput } from './TextInput.tsx';
import menu from '../styles/menu.module.css';
import styles from './Combobox.module.css';

export interface ComboboxOption {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}
/** Search keeps DOM focus in the input; aria-activedescendant exposes the highlighted result. */
export function Combobox({
  label,
  placeholder,
  emptyLabel,
  options,
  value,
  onChange,
  disabled,
  id: suppliedId,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  label: string;
  placeholder?: string;
  emptyLabel: string;
  options: readonly ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);
  const matches = options.filter((option) =>
    `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const changeOpen = (next: boolean) => {
    setOpen(next);
    setActive(-1);
    if (!next) setQuery(selectedLabel);
  };
  const choose = (option: ComboboxOption) => {
    if (!option.disabled) {
      onChange(option.value);
      setQuery(option.label);
      setOpen(false);
      setActive(-1);
    }
  };
  const activeOption = matches[active];
  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id, open]);
  return (
    <Primitive.Root open={open && !disabled} onOpenChange={changeOpen}>
      <Primitive.Anchor asChild>
        <div className={styles.anchor}>
          <TextInput
            id={id}
            aria-label={label}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && !disabled}
            aria-controls={`${id}-list`}
            aria-activedescendant={open && activeOption ? `${id}-option-${active}` : undefined}
            placeholder={placeholder}
            icon={<Icon name="search" />}
            value={query}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (open) {
                  event.preventDefault();
                  event.stopPropagation();
                  changeOpen(false);
                }
                return;
              }
              if (event.key === 'Tab') {
                changeOpen(false);
                return;
              }
              if (event.key === 'Enter' && open && activeOption) {
                event.preventDefault();
                choose(activeOption);
                return;
              }
              if (
                !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) ||
                (!open && ['Home', 'End'].includes(event.key))
              )
                return;
              event.preventDefault();
              setOpen(true);
              const enabled = matches
                .map((option, index) => (option.disabled ? -1 : index))
                .filter((index) => index >= 0);
              const position = enabled.indexOf(active);
              const next =
                event.key === 'Home'
                  ? enabled[0]
                  : event.key === 'End'
                    ? enabled.at(-1)
                    : event.key === 'ArrowDown'
                      ? enabled[(position + 1) % enabled.length]
                      : enabled[(position <= 0 ? enabled.length : position) - 1];
              setActive(next ?? -1);
            }}
          />
        </div>
      </Primitive.Anchor>
      <Primitive.Portal>
        <Primitive.Content
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className={`${menu.menu} ${styles.results}`}
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if ((event.target as HTMLElement).id === id) event.preventDefault();
          }}
        >
          {matches.length ? (
            matches.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={value === option.value}
                aria-disabled={option.disabled || undefined}
                data-highlighted={active === index ? '' : undefined}
                data-disabled={option.disabled ? '' : undefined}
                className={menu.item}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => {
                  if (!option.disabled) setActive(index);
                }}
                onClick={() => choose(option)}
              >
                <span className={styles.label}>{option.label}</span>
                {option.detail && <span className={menu.detail}>{option.detail}</span>}
              </div>
            ))
          ) : (
            <div className={menu.heading}>{emptyLabel}</div>
          )}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
