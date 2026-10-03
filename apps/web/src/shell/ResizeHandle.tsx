import { useEffect, useState } from 'react';
import { Separator } from 'react-resizable-panels';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { MessageId } from '../i18n/translate.ts';
import styles from './ResizeHandle.module.css';

/** The catalog ids of a handle's accessible name and of its size while dragging. */
export interface ResizeLabels {
  readonly resize: MessageId;
  readonly size: MessageId;
}

const axisLabels: Record<'right' | 'chart', ResizeLabels> = {
  right: { resize: 'layout.resizeRight', size: 'layout.rightSize' },
  chart: { resize: 'layout.resizeChart', size: 'layout.chartSize' },
};

/**
 * A drag handle between two panes (G1): `right` separates side-by-side panes, `chart` stacked
 * ones. Other splits than the right panel and the chart name their panes with `labels`.
 */
export function ResizeHandle({
  axis,
  size,
  onReset,
  labels = axisLabels[axis],
}: {
  axis: 'right' | 'chart';
  size: number;
  onReset: () => void;
  labels?: ResizeLabels;
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
      aria-label={t(labels.resize)}
      title={t('layout.resetHint')}
      data-dragging={dragging || undefined}
      disableDoubleClick
      onDoubleClick={onReset}
      onPointerDown={() => setDragging(true)}
    >
      <span className={styles.tip}>
        {t(labels.size, { size: Math.round(size) })}
        <span>{t('layout.resetHint')}</span>
      </span>
    </Separator>
  );
}
