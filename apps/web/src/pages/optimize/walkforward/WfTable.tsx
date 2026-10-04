import { useId, useRef, type RefObject } from 'react';
import { Button } from '../../../components/Button.tsx';
import { Chip } from '../../../components/Chip.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { Select } from '../../../components/Select.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { useLayout } from '../../../shell/useLayout.ts';
import type { WalkForwardView } from '../../../workflows/walk-forward.ts';
import { objectiveGroups, type ObjectiveId } from '../../../workflows/optimize-ranking.ts';
import { AddConditionTrigger } from '../filters/AddConditionTrigger.tsx';
import { filterLabel } from '../filters/filter-label.ts';
import { dateRange, figure, parameterSet, windowLabel } from './results/copy.ts';
import styles from './results/Results.module.css';

type WindowRow = WalkForwardView['windows'][number];

/** A window's IS and OOS net, WFE and OOS trades, as the table's last four columns show them. */
function windowFigures(window: WindowRow) {
  const unavailable = window.status === 'waiting' || window.status === 'running';
  const outOfSample = unavailable ? null : (window.outOfSample?.netProfit ?? null);
  return {
    unavailable,
    inSample: figure(unavailable ? null : window.inSample?.netProfit, 0, true),
    outOfSample: figure(outOfSample, 0, true),
    outOfSampleTone:
      outOfSample == null ? undefined : outOfSample < 0 ? ('loss' as const) : ('profit' as const),
    wfe: figure(unavailable ? null : window.wfe, 2),
    wfeTone: (window.wfe ?? 0) < 0 ? ('loss' as const) : undefined,
    trades: figure(unavailable ? null : window.outOfSample?.trades),
  };
}

/**
 * A phone (G4) lists the windows as cards, like the leaderboard's, so the IS and OOS net, WFE and
 * trades stay in view instead of past the edge of a table wider than the phone.
 */
function WindowCards({
  view,
  objective,
}: {
  view: WalkForwardView;
  objective: RefObject<HTMLButtonElement | null>;
}) {
  const { t, text } = useI18n();
  const selectWindow = useOptimizationStore((state) => state.actions.selectWindow);
  const id = useId();
  const complete = !view.inProgress && view.totals.completed === view.totals.windows;
  const first = view.windows[0];
  const last = view.windows.at(-1);
  const labelled = (label: string, value: string, tone?: 'profit' | 'loss') => (
    <span>
      {label}
      <b data-tone={tone}>{value}</b>
    </span>
  );
  return (
    <div className={styles.cardList} role="region" aria-label={t('optimize.wfResults.table')}>
      <ol className={styles.cards}>
        {view.windows.map((window) => {
          const { plan } = window;
          const figures = windowFigures(window);
          const exceptional = window.status === 'flat' || window.status === 'failed';
          return (
            <li key={plan.index} data-status={window.status}>
              <button
                type="button"
                className={styles.card}
                aria-label={t('optimize.wfResults.selectWindow', {
                  window: windowLabel(plan.index),
                })}
                aria-describedby={`${id}-${plan.index}`}
                aria-pressed={view.selection?.window.plan.index === plan.index}
                onClick={() => selectWindow(plan.index)}
              >
                <span className={styles.cardWindow}>{text(windowLabel(plan.index))}</span>
                <span className={styles.cardDetails} id={`${id}-${plan.index}`}>
                  <span className={styles.range}>
                    {text(dateRange(plan.outOfSampleStart, plan.outOfSampleEnd, true))}
                    {plan.partial && (
                      <span className={styles.partial}>{t('optimize.wfResults.partial')}</span>
                    )}
                  </span>
                  {exceptional ? (
                    <span className={styles.exception}>
                      {t(`optimize.wfResults.status.${window.status}`)}
                      {window.status === 'failed' && window.error && (
                        <span>{text(window.error)}</span>
                      )}
                    </span>
                  ) : (
                    <>
                      <span className={styles.parameters}>
                        {figures.unavailable
                          ? t(`optimize.wfResults.status.${window.status}`)
                          : text(parameterSet(window.parameters, view.searchRows))}
                      </span>
                      <span className={styles.cardFigures}>
                        {labelled(t('optimize.wfResults.is'), text(figures.inSample))}
                        {labelled(
                          t('optimize.wfResults.oos'),
                          text(figures.outOfSample),
                          figures.outOfSampleTone,
                        )}
                        {labelled(t('optimize.wfResults.wfe'), text(figures.wfe), figures.wfeTone)}
                        {labelled(t('optimize.wfResults.trades'), text(figures.trades))}
                      </span>
                    </>
                  )}
                </span>
              </button>
              {window.status === 'flat' && (
                <Button
                  variant="link"
                  className={styles.cardAdjust}
                  onClick={() => {
                    selectWindow(plan.index);
                    objective.current?.focus();
                  }}
                >
                  {t('optimize.wfResults.adjust')}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      <div className={styles.totalCard}>
        <strong className={styles.cardWindow}>{t('optimize.wfResults.total')}</strong>
        {complete ? (
          <span className={styles.cardDetails}>
            <span className={styles.range}>
              {first && last
                ? text(dateRange(first.plan.outOfSampleStart, last.plan.outOfSampleEnd, true))
                : text(figure(null))}
            </span>
            <span className={styles.parameters}>
              {t('optimize.wfResults.profitable', {
                count: view.totals.profitable,
                total: view.totals.traded,
              })}
              {view.totals.flat > 0 &&
                t('optimize.wfResults.flatCount', { count: view.totals.flat })}
              {view.totals.failed > 0 &&
                t('optimize.wfResults.failedCount', { count: view.totals.failed })}
            </span>
            <span className={styles.cardFigures}>
              {labelled(t('optimize.wfResults.is'), text(figure(view.totals.inSampleNet, 0, true)))}
              {labelled(
                t('optimize.wfResults.oos'),
                text(figure(view.totals.outOfSampleNet, 0, true)),
                (view.totals.outOfSampleNet ?? 0) < 0 ? 'loss' : 'profit',
              )}
              {labelled(t('optimize.wfResults.wfe'), text(figure(view.totals.wfe, 2)))}
              {labelled(
                t('optimize.wfResults.trades'),
                text(figure(view.totals.outOfSampleTrades)),
              )}
            </span>
          </span>
        ) : (
          <span className={styles.waitingTotal}>{t('optimize.wfResults.totalsWaiting')}</span>
        )}
      </div>
    </div>
  );
}

/** The table selects windows; objective/filter changes stay in the session. */
export function WfTable() {
  const { t, text } = useI18n();
  const phone = useLayout() === 'phone';
  const view = useOptimizationStore((state) => state.walkForward);
  const settings = useOptimizationStore((state) => state.viewSettings);
  const actions = useOptimizationStore((state) => state.actions);
  const objective = useRef<HTMLButtonElement>(null);
  if (!view) return null;
  const { selectWindow } = actions;
  const complete = !view.inProgress && view.totals.completed === view.totals.windows;
  const first = view.windows[0];
  const last = view.windows.at(-1);
  return (
    <section
      className={styles.tablePanel}
      aria-label={t('optimize.wfResults.perWindow')}
      aria-busy={view.pending}
    >
      <header className={styles.tableHeader}>
        <h2>{t('optimize.wfResults.perWindow')}</h2>
        <div className={styles.objectiveControl}>
          <span>{t('optimize.setup.by')}</span>
          <Select
            ref={objective}
            className={styles.objective}
            label={t('optimize.setup.objective')}
            value={settings.objective}
            onChange={(value) => actions.setObjective(value as ObjectiveId)}
            options={objectiveGroups.map(({ group, objectives }) => ({
              label: t(`optimize.setup.group.${group}`),
              options: objectives.map((id) => ({
                value: id,
                label: t(
                  id === 'netProfit'
                    ? 'optimize.setup.objective.isNetProfit'
                    : `optimize.setup.objective.${id}`,
                ),
              })),
            }))}
          />
        </div>
        <Button
          variant="toolbar"
          className={styles.direction}
          aria-label={t('optimize.wfResults.direction', {
            direction: t(
              settings.direction === 'maximize' ? 'optimize.setup.max' : 'optimize.setup.min',
            ),
          })}
          onClick={() =>
            actions.setDirection(settings.direction === 'maximize' ? 'minimize' : 'maximize')
          }
        >
          <Icon name={settings.direction === 'maximize' ? 'chevron' : 'up'} size={11} />
        </Button>
        <div className={styles.filters} role="group" aria-label={t('optimize.setup.filters')}>
          {settings.filters.map((filter, index) => {
            const label = text(filterLabel(filter));
            return (
              <Chip
                key={`${index}-${label}`}
                label={label}
                removeLabel={t('optimize.setup.removeFilter', { filter: label })}
                onRemove={() => actions.removeFilter(index)}
              />
            );
          })}
          <AddConditionTrigger />
        </div>
      </header>
      {phone ? (
        <WindowCards view={view} objective={objective} />
      ) : (
        <div
          className={styles.tableScroll}
          tabIndex={0}
          role="region"
          aria-label={t('optimize.wfResults.table')}
        >
          <table className={styles.table}>
            <colgroup>
              <col className={styles.windowColumn} />
              <col className={styles.rangeColumn} />
              <col />
              <col className={styles.numberColumn} />
              <col className={styles.numberColumn} />
              <col className={styles.wfeColumn} />
              <col className={styles.tradesColumn} />
            </colgroup>
            <thead>
              <tr>
                {(['window', 'oosRange', 'parameters', 'is', 'oos', 'wfe', 'trades'] as const).map(
                  (column) => (
                    <th key={column} scope="col">
                      {t(`optimize.wfResults.${column}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {view.windows.map((window) => {
                const { plan } = window;
                const figures = windowFigures(window);
                const { unavailable } = figures;
                const exceptional = window.status === 'flat' || window.status === 'failed';
                return (
                  <tr
                    key={plan.index}
                    data-window={plan.index}
                    data-selected={view.selection?.window.plan.index === plan.index || undefined}
                    data-status={window.status}
                    onClick={() => selectWindow(plan.index)}
                  >
                    <th scope="row">
                      <button
                        type="button"
                        className={styles.rowButton}
                        aria-label={t('optimize.wfResults.selectWindow', {
                          window: windowLabel(plan.index),
                        })}
                        aria-pressed={view.selection?.window.plan.index === plan.index}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectWindow(plan.index);
                        }}
                      >
                        {text(windowLabel(plan.index))}
                      </button>
                    </th>
                    <td className={styles.range}>
                      {text(dateRange(plan.outOfSampleStart, plan.outOfSampleEnd, true))}
                      {plan.partial && (
                        <span
                          className={styles.partial}
                          title={t('optimize.wfResults.partialHint')}
                        >
                          {t('optimize.wfResults.partial')}
                        </span>
                      )}
                    </td>
                    {exceptional ? (
                      <>
                        <td
                          colSpan={4}
                          className={styles.exception}
                          title={window.error ? text(window.error) : undefined}
                        >
                          {t(`optimize.wfResults.status.${window.status}`)}
                          {window.status === 'failed' && window.error && (
                            <span>{text(window.error)}</span>
                          )}
                        </td>
                        <td>
                          {window.status === 'flat' && (
                            <Button
                              variant="link"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectWindow(plan.index);
                                objective.current?.focus();
                              }}
                            >
                              {t('optimize.wfResults.adjust')}
                            </Button>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className={styles.parameters}
                          title={
                            unavailable
                              ? undefined
                              : text(parameterSet(window.parameters, view.searchRows, true))
                          }
                        >
                          {unavailable
                            ? t(`optimize.wfResults.status.${window.status}`)
                            : text(parameterSet(window.parameters, view.searchRows))}
                        </td>
                        <td>{text(figures.inSample)}</td>
                        <td data-tone={figures.outOfSampleTone}>{text(figures.outOfSample)}</td>
                        <td data-tone={figures.wfeTone}>{text(figures.wfe)}</td>
                        <td>{text(figures.trades)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t('optimize.wfResults.total')}</th>
                {complete ? (
                  <>
                    <td className={styles.range}>
                      {first && last
                        ? text(
                            dateRange(first.plan.outOfSampleStart, last.plan.outOfSampleEnd, true),
                          )
                        : text(figure(null))}
                    </td>
                    <td className={styles.parameters}>
                      {t('optimize.wfResults.profitable', {
                        count: view.totals.profitable,
                        total: view.totals.traded,
                      })}
                      {view.totals.flat > 0 &&
                        t('optimize.wfResults.flatCount', { count: view.totals.flat })}
                      {view.totals.failed > 0 &&
                        t('optimize.wfResults.failedCount', { count: view.totals.failed })}
                    </td>
                    <td>{text(figure(view.totals.inSampleNet, 0, true))}</td>
                    <td data-tone={(view.totals.outOfSampleNet ?? 0) < 0 ? 'loss' : 'profit'}>
                      {text(figure(view.totals.outOfSampleNet, 0, true))}
                    </td>
                    <td>{text(figure(view.totals.wfe, 2))}</td>
                    <td>{text(figure(view.totals.outOfSampleTrades))}</td>
                  </>
                ) : (
                  <td colSpan={6} className={styles.waitingTotal}>
                    {t('optimize.wfResults.totalsWaiting')}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
