import { useId, useRef, useState, type ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { NumberField } from '../../components/NumberField.tsx';
import { Select } from '../../components/Select.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { MessageId } from '../../i18n/translate.ts';
import { useBacktestStore } from '../../state/backtest.ts';
import { defaultPaneSizes, uiStore, useUiStore } from '../../state/ui.ts';
import type { PropertyField, PropertyId, PropertyValues } from '../../workflows/properties.ts';
import {
  editText,
  optionValues,
  parseEditText,
  scriptValueText,
  valueText,
} from './property-display.ts';
import styles from './PropertiesDialog.module.css';

type NumericId =
  | 'initialCapital'
  | 'orderSize'
  | 'pyramiding'
  | 'commission'
  | 'longLeverage'
  | 'shortLeverage'
  | 'slippage';
type OptionId =
  'orderSizeUnit' | 'scriptExecution' | 'commissionUnit' | 'limitFillTicks' | 'orderDelay';

const close = () => uiStore.getState().setDialogOpen('properties', false);

function useFields() {
  const fields = useBacktestStore((state) => state.properties);
  return <K extends PropertyId>(id: K) =>
    fields.find((field) => field.id === id) as PropertyField<K> | undefined;
}

type Width = 'w64' | 'w98' | 'w104' | 'w150';

/** A numeric property's field: text as typed while focused, NaN for text that is not a number. */
function NumberControl({
  field,
  width,
  label,
}: {
  field: PropertyField<NumericId>;
  width: Width;
  label: string;
}) {
  const { t } = useI18n();
  const setProperty = useBacktestStore((state) => state.actions.setProperty);
  const element = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const value = field.value as number | undefined;
  const shown =
    draft !== null && Object.is(parseEditText(field.id, draft), value) ? draft : editText(value);
  return (
    <NumberField
      ref={element}
      className={`${styles.number} ${styles[width]}`}
      compact
      stepper={false}
      value={shown}
      label={label}
      decrementLabel={t('inputs.decrease', { title: label })}
      incrementLabel={t('inputs.increase', { title: label })}
      aria-invalid={field.error ? true : undefined}
      onChange={(raw) => {
        setDraft(element.current === document.activeElement ? raw : null);
        setProperty(field.id, parseEditText(field.id, raw));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function OptionControl({
  field,
  width,
  label,
}: {
  field: PropertyField<OptionId>;
  width: Width;
  label: string;
}) {
  const { text } = useI18n();
  const setProperty = useBacktestStore((state) => state.actions.setProperty);
  const values = optionValues(field.id, field.value);
  return (
    <Select
      className={`${styles.select} ${styles[width]}`}
      label={label}
      value={field.value === undefined ? undefined : String(field.value)}
      options={values.map((value) => ({
        value: String(value),
        label: text(valueText(field.id, value as PropertyValues[OptionId])),
      }))}
      onChange={(value) => {
        const chosen = values.find((item) => String(item) === value);
        if (chosen !== undefined) setProperty(field.id, chosen as PropertyValues[typeof field.id]);
      }}
    />
  );
}

/** One row: the label, its controls, then the override, error and support notes (B13). */
function Row({
  label,
  fields,
  children,
  note,
}: {
  label: string;
  fields: readonly (PropertyField | undefined)[];
  children: ReactNode;
  note?: string;
}) {
  const { t, text } = useI18n();
  const resetProperty = useBacktestStore((state) => state.actions.resetProperty);
  const present = fields.filter((field): field is PropertyField => field !== undefined);
  const overridden = present.some((field) => field.overridden);
  return (
    <div className={styles.row}>
      <div className={styles.line}>
        <span className={styles.label}>
          {label}
          {overridden && <span className={styles.changed} />}
        </span>
        <div className={styles.controls}>{children}</div>
      </div>
      {present.map((field) => {
        if (!field.overridden) return null;
        const { script } = field;
        const scriptText = scriptValueText(field);
        return (
          <span key={field.id} className={styles.note}>
            {script.kind === 'expression' || scriptText === null
              ? t('properties.overriddenComputed', {
                  line: script.kind === 'expression' ? script.line : 0,
                })
              : t('properties.overriddenValue', { value: scriptText })}
            <Button
              variant="link"
              className={styles.inlineLink}
              onClick={() => resetProperty(field.id)}
            >
              {t('properties.reset')}
            </Button>
          </span>
        );
      })}
      {present.map(
        (field) =>
          field.error && (
            <span key={`${field.id}-error`} className={styles.error} role="alert">
              {text(field.error)}
            </span>
          ),
      )}
      {note && <span className={styles.note}>{note}</span>}
    </div>
  );
}

function Group({ heading, children }: { heading: MessageId; children: ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <section className={styles.group} aria-labelledby={id}>
      <h3 id={id} className={styles.groupTitle}>
        {t(heading)}
      </h3>
      {children}
    </section>
  );
}

/**
 * Strategy properties (B13), drilled in from the right panel's summary and laid over it. The
 * script's `strategy()` values are the defaults; overrides go through the session.
 */
export function PropertiesDialog() {
  const { t } = useI18n();
  const field = useFields();
  const fields = useBacktestStore((state) => state.properties);
  const resetProperties = useBacktestStore((state) => state.actions.resetProperties);
  const currency = useBacktestStore((state) => {
    const value = state.dataset?.input.syminfo.currency;
    return typeof value === 'string' ? value : 'USD';
  });
  const width = useUiStore((state) =>
    Math.max(state.paneSizes[state.page].right, defaultPaneSizes.right),
  );
  const label = (id: PropertyId) => t(`backtest.property.${id}`);
  const overridden = fields.filter((item) => item.overridden).length;
  const number = (id: NumericId, size: Width, suffix?: string) => {
    const item = field(id);
    return (
      item && (
        <>
          <NumberControl field={item} width={size} label={label(id)} />
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </>
      )
    );
  };
  const option = (id: OptionId, size: Width) => {
    const item = field(id);
    return item && <OptionControl field={item} width={size} label={label(id)} />;
  };
  const slippage = field('slippage')?.value;
  return (
    <Primitive.Root open modal={false} onOpenChange={(open) => !open && close()}>
      <Primitive.Portal>
        <Primitive.Content
          className={styles.panel}
          style={{ width }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className={styles.header}>
            <IconButton icon="left" label={t('properties.back')} onClick={close} tooltip={false} />
            <Primitive.Title className={styles.title}>{t('backtest.properties')}</Primitive.Title>
            <Primitive.Description className={styles.description}>
              {t('properties.shared')}
            </Primitive.Description>
          </div>
          {!fields.length ? (
            <p className={styles.empty}>{t('backtest.propertiesHint')}</p>
          ) : (
            <>
              <div className={styles.body}>
                <Group heading="properties.groupGeneral">
                  <Row label={label('initialCapital')} fields={[field('initialCapital')]}>
                    {number('initialCapital', 'w104', currency)}
                  </Row>
                  <Row
                    label={t('properties.currency')}
                    fields={[]}
                    note={t('properties.currencyNote')}
                  >
                    <span className={styles.static}>{t('properties.sameAsChart')}</span>
                  </Row>
                  <Row
                    label={label('orderSize')}
                    fields={[field('orderSize'), field('orderSizeUnit')]}
                  >
                    {number('orderSize', 'w64')}
                    {option('orderSizeUnit', 'w98')}
                  </Row>
                  <Row label={t('properties.pyramiding')} fields={[field('pyramiding')]}>
                    {number('pyramiding', 'w64')}
                  </Row>
                </Group>
                <Group heading="properties.groupExecution">
                  <Row
                    label={t('properties.barDetalization')}
                    fields={[]}
                    note={t('properties.detalizationNote')}
                  >
                    <span className={styles.static}>{t('properties.ticksPerBar')}</span>
                  </Row>
                  <Row label={label('scriptExecution')} fields={[field('scriptExecution')]}>
                    {option('scriptExecution', 'w150')}
                  </Row>
                </Group>
                <Group heading="properties.groupBroker">
                  <Row
                    label={label('commission')}
                    fields={[field('commission'), field('commissionUnit')]}
                  >
                    {number('commission', 'w64')}
                    {option('commissionUnit', 'w98')}
                  </Row>
                  <Row label={label('longLeverage')} fields={[field('longLeverage')]}>
                    {number('longLeverage', 'w64', t('properties.leverageSuffix'))}
                  </Row>
                  <Row label={label('shortLeverage')} fields={[field('shortLeverage')]}>
                    {number('shortLeverage', 'w64', t('properties.leverageSuffix'))}
                  </Row>
                  <Row label={label('slippage')} fields={[field('slippage')]}>
                    {number(
                      'slippage',
                      'w64',
                      t(slippage === 1 ? 'properties.tick' : 'properties.ticks'),
                    )}
                  </Row>
                  <Row label={label('limitFillTicks')} fields={[field('limitFillTicks')]}>
                    {option('limitFillTicks', 'w150')}
                  </Row>
                  <Row label={label('orderDelay')} fields={[field('orderDelay')]}>
                    {option('orderDelay', 'w150')}
                  </Row>
                </Group>
              </div>
              <div className={styles.footer}>
                <span className={styles.count}>
                  {t('properties.overriddenCount', { count: overridden })}
                </span>
                <Button
                  icon={<Icon name="reset" size={13} />}
                  disabled={!overridden}
                  onClick={resetProperties}
                >
                  {t('properties.resetAll')}
                </Button>
              </div>
            </>
          )}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
