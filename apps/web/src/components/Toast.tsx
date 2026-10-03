import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';
import * as Primitive from '@radix-ui/react-toast';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import styles from './Toast.module.css';

export interface ToastMessage {
  message: string;
  tone?: 'success' | 'amber' | 'danger';
  duration?: number;
  action?: { label: string; altText: string; onClick: () => void };
}
interface ToastQueue {
  push: (toast: ToastMessage) => number;
  dismiss: (id: number) => void;
}
const Context = createContext<ToastQueue | null>(null);

/** Static presentation is also used by the live queue and the development sheet. */
export function Toast({
  tone = 'success',
  children,
  action,
  className = '',
  ...props
}: ComponentPropsWithRef<'div'> & { tone?: ToastMessage['tone']; action?: ReactNode }) {
  return (
    <div
      {...props}
      className={`${styles.toast} ${styles[tone]} ${className}`}
      data-action={!!action}
    >
      <Icon
        name={tone === 'success' ? 'check' : tone === 'amber' ? 'warning' : 'error'}
        size={tone === 'success' ? 12 : 14}
      />
      <div className={styles.message}>{children}</div>
      {action}
    </div>
  );
}

/** FIFO delivery avoids overlapping announcements. Action toasts require explicit dismissal. */
export function ToastProvider({
  children,
  label,
  closeLabel,
  duration = 5000,
}: {
  children: ReactNode;
  label: string;
  closeLabel: string;
  duration?: number;
}) {
  const [queue, setQueue] = useState<(ToastMessage & { id: number })[]>([]);
  const nextId = useRef(0);
  const push = useCallback((toast: ToastMessage) => {
    const id = ++nextId.current;
    setQueue((previous) => [...previous, { ...toast, id }]);
    return id;
  }, []);
  const dismiss = useCallback(
    (id: number) => setQueue((previous) => previous.filter((toast) => toast.id !== id)),
    [],
  );
  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);
  const current = queue[0];
  return (
    <Context.Provider value={api}>
      <Primitive.Provider label={label} duration={duration} swipeDirection="right">
        {children}
        {current && (
          <Primitive.Root
            key={current.id}
            className={styles.entry}
            open
            duration={current.action ? Infinity : (current.duration ?? duration)}
            onOpenChange={(open) => {
              if (!open) dismiss(current.id);
            }}
          >
            <Toast
              tone={current.tone}
              action={
                <>
                  {current.action && (
                    <Primitive.Action asChild altText={current.action.altText}>
                      <Button className={styles.action} onClick={current.action.onClick}>
                        {current.action.label}
                      </Button>
                    </Primitive.Action>
                  )}
                  <Primitive.Close asChild>
                    <IconButton icon="close" label={closeLabel} tooltip={false} />
                  </Primitive.Close>
                </>
              }
            >
              <Primitive.Description>{current.message}</Primitive.Description>
            </Toast>
          </Primitive.Root>
        )}
        <Primitive.Viewport className={styles.viewport} label={label} />
      </Primitive.Provider>
    </Context.Provider>
  );
}
export function useToast(): ToastQueue {
  const context = useContext(Context);
  if (!context) throw new Error('useToast requires ToastProvider');
  return context;
}
