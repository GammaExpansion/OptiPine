import type { ReactElement, ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-tooltip';
import styles from './Tooltip.module.css';

export function Tooltip({
  children,
  content,
  delayDuration = 350,
}: {
  children: ReactElement;
  content: ReactNode;
  delayDuration?: number;
}) {
  return (
    <Primitive.Provider delayDuration={delayDuration}>
      <Primitive.Root>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content className={styles.content} sideOffset={6} collisionPadding={8}>
            {content}
            <Primitive.Arrow className={styles.arrow} />
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
