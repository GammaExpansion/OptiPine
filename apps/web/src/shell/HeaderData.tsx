import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';

export function HeaderData() {
  const { t } = useI18n();
  return (
    <>
      <Button variant="toolbar">
        <Icon name="file" />
        {t('shell.openScript')}
        <Icon name="chevron" size={12} />
      </Button>
      <Button variant="toolbar">
        {t('shell.selectData')}
        <Icon name="chevron" size={12} />
      </Button>
      <SegmentedControl
        label={t('shell.timeframe')}
        value=""
        disabled
        options={[
          { value: '15', label: t('shell.15m') },
          { value: '60', label: t('shell.1h') },
          { value: '240', label: t('shell.4h') },
          { value: 'D', label: t('shell.1D') },
        ]}
      />
      <Button variant="toolbar" disabled>
        <Icon name="calendar" />
        {t('shell.dateRange')}
      </Button>
    </>
  );
}
