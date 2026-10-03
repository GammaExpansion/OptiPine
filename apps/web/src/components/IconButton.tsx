import type { ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { DisabledReason } from './DisabledReason.tsx';
import { Tooltip } from './Tooltip.tsx';
import styles from './IconButton.module.css';

export function IconButton({
  icon,
  label,
  className = '',
  disabled,
  disabledReason,
  active,
  tooltip = true,
  onClick,
  ...props
}: Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  icon: IconName;
  label: string;
  active?: boolean;
  disabledReason?: string;
  tooltip?: boolean;
}) {
  return (
    <DisabledReason reason={disabled ? disabledReason : undefined}>
      {(descriptionId) => {
        const button = (
          <button
            {...props}
            type="button"
            className={`${styles.button} ${className}`}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            aria-describedby={
              [props['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined
            }
            onClick={(event) => {
              if (props['aria-disabled'] === true || props['aria-disabled'] === 'true') {
                event.preventDefault();
                return;
              }
              onClick?.(event);
            }}
          >
            <Icon name={icon} size={15} />
          </button>
        );
        return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
      }}
    </DisabledReason>
  );
}
