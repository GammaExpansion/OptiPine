import { useEffect, useState } from 'react';
import { Separator } from 'react-resizable-panels';
import { useI18n } from '../i18n/I18nProvider.tsx';
import styles from './ResizeHandle.module.css';

export function ResizeHandle({
  axis,
  size,
  onReset,
}: {
  axis: 'right' | 'chart';
  size: number;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [dragging]);
  return (
    <Separator
      className={`${styles.handle} ${styles[axis]}`}
      aria-label={t(axis === 'right' ? 'layout.resizeRight' : 'layout.resizeChart')}
      title={t('layout.resetHint')}
      data-dragging={dragging || undefined}
      disableDoubleClick
      onDoubleClick={onReset}
      onPointerDown={() => setDragging(true)}
    >
      <span className={styles.tip}>
        {t(axis === 'right' ? 'layout.rightSize' : 'layout.chartSize', { size: Math.round(size) })}
        <span>{t('layout.resetHint')}</span>
      </span>
    </Separator>
  );
}
