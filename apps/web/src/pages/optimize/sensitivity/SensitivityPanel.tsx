import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Message } from '@pine/messages';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { moveAxis, type AxisMove, type AxisRole } from './axis-move.ts';
import { sensitivityPaths } from './spark-geometry.ts';
import { useBinInspection } from '../map/inspection.ts';
import { BinInspection, CurveInspection } from '../map/MapInspection.tsx';
import styles from './SensitivityPanel.module.css';

/** Sensitivity: one row per searched input, with transactional axis moves (R12). */
export function SensitivityPanel() {
  const { t, text } = useI18n();
  const view = useOptimizationStore((state) => state.views?.sensitivity);
  const map = useOptimizationStore((state) => state.views?.map);
  const curve = useOptimizationStore((state) => state.views?.curve);
  const bin = useBinInspection();
  const inProgress = useOptimizationStore((state) => state.views?.inProgress ?? true);
  const setAxis = useOptimizationStore((state) => state.actions.setAxis);
  const [move, setMove] = useState<AxisMove | null>(null);
  const current = useRef<AxisMove | null>(null);
  const [announcement, setAnnouncement] = useState<Message | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const focus = useRef<{ role: AxisRole; title: string } | null>(null);
  const root = useRef<HTMLElement>(null);
  const help = useId();
  const titles = useMemo(() => view?.rows.map((row) => row.parameter) ?? [], [view]);
  const paths = useMemo(
    () => view?.rows.map((row) => sensitivityPaths(row.points, view.sharedScale)) ?? [],
    [view],
  );
  const update = (event: Parameters<typeof moveAxis>[1]) => {
    const result = moveAxis(current.current, event, titles);
    if (!result) return;
    current.current = result.move;
    setMove(result.move);
    setAnnouncement(result.announcement);
    if (result.commit) {
      focus.current = result.commit;
      setAxis(result.commit.role, result.commit.title);
    }
  };
  useEffect(() => {
    if (
      focus.current &&
      view?.rows.some(
        (row) => row.role === focus.current!.role && row.parameter === focus.current!.title,
      )
    ) {
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-axis-marker="${focus.current.role}"]`)
        ?.focus();
      focus.current = null;
    }
  }, [view]);
  useEffect(() => {
    current.current = null;
    setMove(null);
    setPointer(null);
  }, [inProgress]);

  if (curve) return <CurveInspection />;
  if (map?.map && bin?.map === map.panel) return <BinInspection />;

  return (
    <section ref={root} className={styles.panel} aria-label={t('optimize.sensitivity.title')}>
      <h2>{t('optimize.sensitivity.title')}</h2>
      <p id={help} className={styles.srOnly}>
        {t('optimize.sensitivity.keyboard')}
      </p>
      {inProgress ? (
        <p className={styles.waiting}>{t('optimize.sensitivity.inProgress')}</p>
      ) : (
        <div className={styles.rows}>
          {view?.rows.map((row, index) => (
            <div
              key={row.parameter}
              className={styles.row}
              data-sensitivity-row={index}
              data-target={move?.target === index || undefined}
              data-axis={row.role ?? undefined}
            >
              <span className={styles.name}>{row.parameter}</span>
              <span className={styles.markerSlot}>
                {(row.role === 'x' || row.role === 'y') && (
                  <button
                    type="button"
                    className={styles.marker}
                    data-axis-marker={row.role}
                    data-dragging={(!!pointer && move?.role === row.role) || undefined}
                    aria-label={t('optimize.sensitivity.marker', {
                      axis: row.role.toUpperCase(),
                      title: row.parameter,
                    })}
                    aria-describedby={help}
                    aria-pressed={move?.role === row.role}
                    onKeyDown={(event) => {
                      if (
                        ![
                          ' ',
                          'ArrowUp',
                          'ArrowDown',
                          'ArrowLeft',
                          'ArrowRight',
                          'Enter',
                          'Escape',
                        ].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      if (event.key === ' ' && !current.current)
                        update({ type: 'pick', role: row.role as AxisRole, index });
                      else if (event.key === 'Enter') update({ type: 'confirm' });
                      else if (event.key === 'Escape') {
                        update({ type: 'cancel' });
                        setPointer(null);
                      } else if (event.key.startsWith('Arrow'))
                        update({
                          type: 'step',
                          delta: event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1,
                        });
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      update({ type: 'pick', role: row.role as AxisRole, index });
                      setPointer({ x: event.clientX, y: event.clientY });
                    }}
                    onPointerMove={(event) => {
                      if (
                        !event.currentTarget.hasPointerCapture(event.pointerId) ||
                        !current.current
                      )
                        return;
                      setPointer({ x: event.clientX, y: event.clientY });
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>('[data-sensitivity-row]');
                      if (target && root.current?.contains(target)) {
                        const index = Number(target.dataset.sensitivityRow);
                        if (index !== current.current.target) update({ type: 'target', index });
                      }
                    }}
                    onPointerUp={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest('[data-sensitivity-row]');
                      update({
                        type: target && root.current?.contains(target) ? 'confirm' : 'cancel',
                      });
                      event.currentTarget.releasePointerCapture(event.pointerId);
                      setPointer(null);
                    }}
                    onPointerCancel={() => {
                      update({ type: 'cancel' });
                      setPointer(null);
                    }}
                    onBlur={() => {
                      if (current.current && !pointer) update({ type: 'cancel' });
                    }}
                  >
                    {t(`optimize.map.${row.role}`)}
                  </button>
                )}
              </span>
              <div className={styles.bar}>
                <i style={{ width: `${Math.max(0, Math.min(100, row.etaSquared * 100))}%` }} />
              </div>
              <span className={styles.share}>
                {formatNumber(row.etaSquared, { style: 'percent', maximumFractionDigits: 0 })}
              </span>
              <svg
                className={styles.spark}
                viewBox="0 0 150 26"
                role="img"
                aria-label={t('optimize.sensitivity.spark', { title: row.parameter })}
              >
                {paths[index].segments.map((segment, index) => (
                  <g key={index}>
                    <path className={styles.band} d={segment.band} />
                    <path className={styles.mean} d={segment.mean} />
                  </g>
                ))}
                {paths[index].dots.map((dot, index) => (
                  <circle key={index} cx={dot.x} cy={dot.y} r={2} />
                ))}
              </svg>
            </div>
          ))}
        </div>
      )}
      <span role="status" className={styles.srOnly}>
        {announcement && text(announcement)}
      </span>
      {move && (
        <p className={styles.hint}>
          {t('optimize.sensitivity.moveHint', {
            title: titles[move.target],
            axis: move.role.toUpperCase(),
          })}
        </p>
      )}
      {move && pointer && (
        <span
          className={styles.floating}
          style={{ left: pointer.x + 10, top: pointer.y - 10 }}
          aria-hidden="true"
        >
          {t(`optimize.map.${move.role}`)}
        </span>
      )}
    </section>
  );
}
