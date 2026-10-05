import { useId } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { searchedParameters } from '../../../workflows/optimize-parameters.ts';
import type { SearchRow } from '../../../workflows/optimize-setup.ts';
import type { LeaderboardRow } from '../../../workflows/optimize-views.ts';
import { useResultFormat } from './useResultFormat.ts';
import styles from './Leaderboard.module.css';

/**
 * G4 cards use the same 13-set page as the desktop table, with every searched input visible, and
 * its whole amounts.
 */
export function LeaderboardCards({
  rows,
  searchRows,
  selectedId,
  unvalidated,
  onSelect,
}: {
  rows: readonly LeaderboardRow[];
  searchRows: readonly SearchRow[];
  selectedId?: string;
  unvalidated: boolean;
  onSelect: (trialId: string) => void;
}) {
  const { t } = useI18n();
  const format = useResultFormat(searchRows);
  const id = useId();
  return (
    <ol className={styles.cards} aria-label={t('optimize.leaderboard.title')}>
      {rows.map((row) => (
        <li key={row.trialId}>
          <button
            className={styles.card}
            aria-label={t('optimize.leaderboard.select', { rank: row.rank })}
            aria-describedby={`${id}-${row.rank}`}
            aria-pressed={selectedId === row.trialId}
            onClick={() => onSelect(row.trialId)}
          >
            <span className={styles.cardRank}>{row.rank}</span>
            <span className={styles.cardDetails} id={`${id}-${row.rank}`}>
              <span className={styles.cardParameters}>
                {searchedParameters(row.parameters, searchRows).map(({ title, value }) => (
                  <span key={title}>
                    {t('optimize.leaderboard.parameter', {
                      title,
                      value: format.parameter(value, title),
                    })}
                  </span>
                ))}
              </span>
              <span className={styles.cardMetrics}>
                <span title={t('optimize.profit.help')}>
                  {t(unvalidated ? 'optimize.leaderboard.net' : 'optimize.profit.is')}
                  <b
                    data-profit={
                      row.inSample.netProfit == null ? undefined : row.inSample.netProfit >= 0
                    }
                  >
                    {format.number(row.inSample.netProfit, true, 0)}
                  </b>
                </span>
                {!unvalidated && (
                  <span title={t('optimize.profit.help')}>
                    {t('optimize.profit.oos')}
                    <b
                      data-profit={
                        row.outOfSample?.netProfit == null
                          ? undefined
                          : row.outOfSample.netProfit >= 0
                      }
                    >
                      {format.number(row.outOfSample?.netProfit, true, 0)}
                    </b>
                  </span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
