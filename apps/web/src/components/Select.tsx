import type { ComponentPropsWithRef } from 'react';
import * as Primitive from '@radix-ui/react-select';
import { Icon } from './Icon.tsx';
import menu from '../styles/menu.module.css';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export interface SelectGroup {
  label: string;
  options: readonly SelectOption[];
}
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  name,
  required,
  className = '',
  ...props
}: Omit<ComponentPropsWithRef<'button'>, 'value' | 'onChange' | 'children' | 'name'> & {
  label: string;
  options: readonly (SelectOption | SelectGroup)[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  required?: boolean;
}) {
  const option = (item: SelectOption) => (
    <Primitive.Item
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      className={menu.item}
    >
      <Primitive.ItemText>{item.label}</Primitive.ItemText>
      <Primitive.ItemIndicator className={styles.check}>
        <Icon name="check" size={12} />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
  return (
    <Primitive.Root
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      name={name}
      required={required}
    >
      <Primitive.Trigger {...props} className={`${styles.trigger} ${className}`} aria-label={label}>
        <Primitive.Value placeholder={placeholder} />
        <Primitive.Icon className={styles.chevron}>
          <Icon name="chevron" size={12} />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          className={`${menu.menu} ${styles.content}`}
          position="popper"
          sideOffset={4}
          collisionPadding={8}
        >
          <Primitive.ScrollUpButton className={styles.scroll}>
            <Icon name="up" />
          </Primitive.ScrollUpButton>
          <Primitive.Viewport>
            {options.map((item) =>
              'options' in item ? (
                <Primitive.Group key={item.label}>
                  <Primitive.Label className={menu.heading}>{item.label}</Primitive.Label>
                  {item.options.map(option)}
                </Primitive.Group>
              ) : (
                option(item)
              ),
            )}
          </Primitive.Viewport>
          <Primitive.ScrollDownButton className={styles.scroll}>
            <Icon name="chevron" />
          </Primitive.ScrollDownButton>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
