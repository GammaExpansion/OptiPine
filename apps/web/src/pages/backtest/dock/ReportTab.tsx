import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import type { KeyFigure } from '../../../workflows/report.ts';
import { IconButton } from '../../../components/IconButton.tsx';
import { DockActions } from './DockActions.tsx';
import { downloadCsv, reportExport } from './results/export.ts';
import { displayedResult, reportFor } from './results/model.ts';
import { metricMessage, metricStyles, numberMessage, metricTone } from './results/formatting.ts';
import { ResultFrame } from './results/ResultFrame.tsx';
import styles from './results/Results.module.css';

function FigureDetail({ figure }: { figure: KeyFigure }) {
  const { t, text } = useI18n();
  const detail = figure.detail;
  switch (detail.kind) {
    case 'percent':
      return text(numberMessage(detail.value, { percent: true, signed: true, loss: figure.loss }));
    case 'sides':
      return t('report.sides', {
        long: numberMessage(detail.long, metricStyles[figure.id]),
        short: numberMessage(detail.short, metricStyles[figure.id]),
      });
    case 'wonLost':
      return t('report.wonLost', {
        won: numberMessage(detail.won, { decimals: 0 }),
        lost: numberMessage(detail.lost, { decimals: 0 }),
      });
    case 'metric':
      return t('report.sortinoDetail', { value: numberMessage(detail.value) });
  }
}

export function ReportTab() {
  const { t, text, language } = useI18n();
  const result = useBacktestStore(displayedResult);
  const report = result && reportFor(result);
  return (
    <ResultFrame>
      {report && (
        <DockActions>
          <IconButton
            icon="download"
            label={t('report.export')}
            onClick={() => downloadCsv(reportExport(report, language), t('report.filename'))}
          />
        </DockActions>
      )}
      <div className={styles.report} role="region" aria-label={t('dock.report')} tabIndex={0}>
        <div className={styles.figures}>
          {report?.keyFigures.map((figure) => (
            <div className={styles.figure} key={figure.id}>
              <span className={styles.secondary}>
                {t(
                  figure.id === 'Trades analysis/Total trades'
                    ? 'report.tradeCount'
                    : metricStyles[figure.id].label,
                )}
              </span>
              <strong data-tone={metricTone(figure.id, figure.value)}>
                {text(metricMessage(figure.id, figure.value, figure.show, figure.loss))}
              </strong>
              <span className={styles.caption}>
                <FigureDetail figure={figure} />
              </span>
            </div>
          ))}
        </div>
        <div className={styles.reportGroups}>
          {report?.groups.map((group) => (
            <table key={group.id} aria-label={t(`report.${group.id}`)}>
              <thead>
                <tr>
                  <th scope="col">{t(`report.${group.id}`)}</th>
                  {(['all', 'long', 'short'] as const).map((scope) => (
                    <th scope="col" key={scope}>
                      {t(`report.${scope}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{t(metricStyles[row.id].label)}</th>
                    {(['all', 'long', 'short'] as const).map((scope) => (
                      <td key={scope} data-tone={metricTone(row.id, row[scope])}>
                        {text(metricMessage(row.id, row[scope], row.show, row.loss))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </ResultFrame>
  );
}
