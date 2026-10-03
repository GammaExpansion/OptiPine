import type { Message } from '@pine/messages';
import { FieldRow } from '../../components/FieldRow.tsx';
import { TextInput } from '../../components/TextInput.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { SymbolInfoKey } from '../../workflows/market-data.ts';
import styles from './DataDialog.module.css';

export type ProfileDraft = Record<SymbolInfoKey, string>;
export const defaultProfile: ProfileDraft = {
  mintick: '0.01',
  pointvalue: '1',
  mincontract: '0.00001',
  timezone: 'Etc/UTC',
};
export function ProfileFields({
  values,
  onChange,
  errors = {},
  manual = false,
}: {
  values: ProfileDraft;
  onChange: (key: SymbolInfoKey, value: string) => void;
  errors?: Partial<Record<SymbolInfoKey, Message>>;
  manual?: boolean;
}) {
  const { t, text } = useI18n();
  return (
    <div className={styles.stack}>
      <div className={styles.previewHead}>
        <strong>{t('data.profile')}</strong>
        <span className={styles.muted}>
          {t(manual ? 'csv.manualProfile' : 'data.providerProfile')}
        </span>
      </div>
      <div className={styles.profileGrid}>
        {(['mintick', 'pointvalue', 'mincontract', 'timezone'] as const).map((key) => (
          <FieldRow
            key={key}
            label={t(`data.profile.${key}`)}
            error={errors[key] ? text(errors[key]) : undefined}
          >
            {(props) => (
              <TextInput
                {...props}
                inputMode={key === 'timezone' ? undefined : 'decimal'}
                value={values[key]}
                onChange={(event) => onChange(key, event.target.value)}
              />
            )}
          </FieldRow>
        ))}
      </div>
    </div>
  );
}
