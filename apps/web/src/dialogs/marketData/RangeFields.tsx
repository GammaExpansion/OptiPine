import { Chip } from '../../components/Chip.tsx';
import { Icon } from '../../components/Icon.tsx';
import { TextInput } from '../../components/TextInput.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { expectedBarCount, presetRange, rangeDates } from '../../workflows/market-data.ts';
import type { Selection } from './selection.ts';
import styles from './DataDialog.module.css';

export function RangeFields({
  value,
  now,
  density = 1,
  onChange,
  estimates = false,
}: {
  value: Selection;
  now: number;
  density?: number;
  onChange: (value: Selection) => void;
  estimates?: boolean;
}) {
  const { t } = useI18n();
  const range =
    value.preset === 'Custom' ? null : presetRange(value.preset, value.feed, value.timeframe, now);
  const dates = range ? rangeDates(range) : { from: value.fromDate, to: value.toDate };
  return (
    <div className={styles.stack}>
      <div>
        <span className={styles.label}>{t('data.range')}</span>
        <div className={styles.chips}>
          {(['1M', '1Y', '2Y', 'All', 'Custom'] as const).map((preset) => {
            const estimate =
              preset === 'Custom'
                ? ''
                : t('data.estimate', {
                    count: expectedBarCount(
                      presetRange(preset, value.feed, value.timeframe, now),
                      value.timeframe,
                      density,
                    ),
                  });
            return (
              <div key={preset} className={styles.preset}>
                <Chip
                  label={t(`data.range.${preset}`)}
                  pressed={value.preset === preset}
                  title={estimate}
                  onClick={() =>
                    onChange({ ...value, preset, fromDate: dates.from, toDate: dates.to })
                  }
                />
                {estimates && estimate && <span className={styles.muted}>{estimate}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.dates}>
        <TextInput
          aria-label={t('data.from')}
          icon={<Icon name="calendar" size={13} />}
          value={dates.from}
          onChange={(event) =>
            onChange({
              ...value,
              preset: 'Custom',
              fromDate: event.target.value,
              toDate: dates.to,
            })
          }
        />
        <span className={styles.muted}>{t('data.to')}</span>
        <TextInput
          aria-label={t('data.to')}
          icon={<Icon name="calendar" size={13} />}
          value={dates.to}
          onChange={(event) =>
            onChange({
              ...value,
              preset: 'Custom',
              fromDate: dates.from,
              toDate: event.target.value,
            })
          }
        />
      </div>
    </div>
  );
}
