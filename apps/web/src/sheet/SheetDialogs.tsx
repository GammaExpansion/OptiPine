import { useState } from 'react';
import { Button } from '../components/Button.tsx';
import { Chip } from '../components/Chip.tsx';
import { Combobox } from '../components/Combobox.tsx';
import { Dialog, DialogClose } from '../components/Dialog.tsx';
import { FieldRow } from '../components/FieldRow.tsx';
import { Note } from '../components/Note.tsx';
import { NumberField } from '../components/NumberField.tsx';
import { Popover, PopoverClose } from '../components/Popover.tsx';
import { SectionHeading } from '../components/SectionHeading.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { Select } from '../components/Select.tsx';
import { Table } from '../components/Table.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { TextInput } from '../components/TextInput.tsx';
import { useToast } from '../components/Toast.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import styles from './SheetDialogs.module.css';

export function SheetDialogs() {
  const { t } = useI18n();
  const toast = useToast();
  const [provider, setProvider] = useState('binance');
  const [market, setMarket] = useState('spot');
  const [symbol, setSymbol] = useState('');
  const [capital, setCapital] = useState('100000');
  const [slippage, setSlippage] = useState('1');
  const [condition, setCondition] = useState('1.3');
  const [operator, setOperator] = useState('ge');
  const [metric, setMetric] = useState('pf');
  const [dateFrom, setDateFrom] = useState('2023-01-02');
  const [dateTo, setDateTo] = useState('2025-05-04');
  const numberLabels = { decrementLabel: t('sheet.decrease'), incrementLabel: t('sheet.increase') };
  return (
    <div className={styles.examples}>
      <Dialog
        title={t('shell.selectData')}
        closeLabel={t('sheet.close')}
        trigger={<Button>{t('shell.selectData')}</Button>}
        footer={
          <>
            <span className={styles.footerHint}>{t('sheet.dataFooter')}</span>
            <DialogClose asChild>
              <Button>{t('sheet.cancel')}</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant="primary"
                disabled={!symbol}
                disabledReason={t('sheet.symbolPlaceholder')}
                onClick={() => toast.push({ message: t('sheet.copied') })}
              >
                {t('sheet.fetch')}
              </Button>
            </DialogClose>
          </>
        }
      >
        <Tabs
          label={t('sheet.market')}
          value={provider}
          onChange={setProvider}
          options={[
            { value: 'binance', label: t('sheet.binance'), description: t('sheet.crypto') },
            { value: 'yahoo', label: t('sheet.yahoo'), description: t('sheet.stocks') },
            { value: 'csv', label: t('sheet.csv'), disabled: true },
          ]}
        >
          <div className={styles.form}>
            {provider === 'binance' && (
              <FieldRow label={t('sheet.market')}>
                <SegmentedControl
                  label={t('sheet.market')}
                  value={market}
                  onChange={setMarket}
                  options={[
                    { value: 'spot', label: t('sheet.spot') },
                    { value: 'perpetual', label: t('sheet.perpetual') },
                  ]}
                />
              </FieldRow>
            )}
            <FieldRow label={t('sheet.symbol')}>
              {(props) => (
                <Combobox
                  {...props}
                  label={t('sheet.symbol')}
                  placeholder={t('sheet.symbolPlaceholder')}
                  emptyLabel={t('sheet.searchEmpty')}
                  value={symbol}
                  onChange={setSymbol}
                  options={[
                    { value: 'BTCUSDT', label: t('sheet.btc'), detail: t('sheet.bitcoin') },
                  ]}
                />
              )}
            </FieldRow>
            <div className={styles.dates}>
              <FieldRow label={t('sheet.startDate')}>
                {(props) => (
                  <TextInput
                    {...props}
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                )}
              </FieldRow>
              <FieldRow label={t('sheet.endDate')}>
                {(props) => (
                  <TextInput
                    {...props}
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                )}
              </FieldRow>
            </div>
            <Note tone={provider === 'yahoo' ? 'amber' : 'neutral'}>
              {t(provider === 'yahoo' ? 'sheet.yahooNote' : 'sheet.providerLimit')}
            </Note>
          </div>
        </Tabs>
      </Dialog>
      <Dialog
        title={t('sheet.properties')}
        description={t('sheet.shared')}
        closeLabel={t('sheet.close')}
        trigger={<Button>{t('sheet.properties')}</Button>}
        size="small"
        footer={
          <Button
            variant="link"
            onClick={() => {
              setCapital('100000');
              setSlippage('0');
            }}
          >
            {t('sheet.resetAll')}
          </Button>
        }
      >
        <div className={styles.form}>
          <SectionHeading>{t('sheet.general')}</SectionHeading>
          <FieldRow label={t('sheet.initialCapital')} inline>
            {(props) => (
              <NumberField
                {...props}
                {...numberLabels}
                label={t('sheet.initialCapital')}
                value={capital}
                onChange={setCapital}
                min={0}
                step={1000}
                stepper={false}
              />
            )}
          </FieldRow>
          <FieldRow
            label={t('sheet.slippage')}
            hint={slippage !== '0' ? t('sheet.overridden') : undefined}
            inline
          >
            {(props) => (
              <NumberField
                {...props}
                {...numberLabels}
                label={t('sheet.slippage')}
                value={slippage}
                onChange={setSlippage}
                min={0}
              />
            )}
          </FieldRow>
          <Note>{t('sheet.unsupportedHint')}</Note>
        </div>
      </Dialog>
      <Popover
        label={t('sheet.condition')}
        trigger={<Chip label={t('optimize.addCondition')} dashed />}
      >
        <div className={styles.condition}>
          <SectionHeading>{t('sheet.condition')}</SectionHeading>
          <FieldRow label={t('sheet.metric')}>
            {(props) => (
              <Select
                {...props}
                label={t('sheet.metric')}
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'pf', label: t('sheet.pf') },
                  { value: 'sharpe', label: t('sheet.sharpe') },
                ]}
              />
            )}
          </FieldRow>
          <FieldRow label={t('sheet.operator')}>
            <SegmentedControl
              label={t('sheet.operator')}
              value={operator}
              onChange={setOperator}
              options={[
                { value: 'ge', label: t('sheet.ge') },
                { value: 'le', label: t('sheet.le') },
              ]}
            />
          </FieldRow>
          <FieldRow label={t('sheet.value')}>
            {(props) => (
              <NumberField
                {...props}
                {...numberLabels}
                label={t('sheet.value')}
                value={condition}
                onChange={setCondition}
                step={0.1}
              />
            )}
          </FieldRow>
          <SectionHeading level={3}>{t('sheet.presets')}</SectionHeading>
          <Chip
            label={t('sheet.presetPf')}
            onClick={() => {
              setMetric('pf');
              setOperator('ge');
              setCondition('1.2');
            }}
          />
          <Note>{t('sheet.previewFilter')}</Note>
          <div className={styles.actions}>
            <PopoverClose asChild>
              <Button>{t('sheet.cancel')}</Button>
            </PopoverClose>
            <PopoverClose asChild>
              <Button variant="primary" onClick={() => toast.push({ message: t('sheet.copied') })}>
                {t('sheet.add')}
              </Button>
            </PopoverClose>
          </div>
        </div>
      </Popover>
      <Dialog
        title={t('sheet.errorsTitle')}
        description={t('sheet.errorsDescription')}
        closeLabel={t('sheet.close')}
        trigger={<Button tone="danger">{t('sheet.failedView')}</Button>}
        size="large"
        footer={
          <>
            <Button onClick={() => toast.push({ message: t('sheet.exported') })}>
              {t('sheet.exportList')}
            </Button>
            <DialogClose asChild>
              <Button>{t('sheet.close')}</Button>
            </DialogClose>
          </>
        }
      >
        <Table caption={t('sheet.errorsTitle')}>
          <thead>
            <tr>
              <th scope="col">{t('sheet.inputs')}</th>
              <th scope="col">{t('sheet.errorColumn')}</th>
              <th scope="col">{t('shell.backtest')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('sheet.failedInputs')}</td>
              <td>
                <div>{t('sheet.runtime')}</div>
                <div>{t('sheet.runtimeDetail')}</div>
              </td>
              <td>
                <Button
                  onClick={() => toast.push({ message: t('sheet.workerError'), tone: 'danger' })}
                >
                  {t('shell.backtest')}
                </Button>
              </td>
            </tr>
          </tbody>
        </Table>
      </Dialog>
    </div>
  );
}
