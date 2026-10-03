import { useEffect, useState, type ReactNode } from 'react';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { Checkbox } from '../components/Checkbox.tsx';
import { Chip } from '../components/Chip.tsx';
import { ChipOverflow } from '../components/ChipOverflow.tsx';
import { DockTabs } from '../components/DockTabs.tsx';
import { DropdownMenu, type MenuEntry } from '../components/DropdownMenu.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { FieldRow } from '../components/FieldRow.tsx';
import { Icon, iconNames } from '../components/Icon.tsx';
import { IconButton } from '../components/IconButton.tsx';
import { KeyValueRow } from '../components/KeyValueRow.tsx';
import { Note } from '../components/Note.tsx';
import { NumberField } from '../components/NumberField.tsx';
import { PageTabs } from '../components/PageTabs.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { SectionHeading } from '../components/SectionHeading.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { Select } from '../components/Select.tsx';
import { Table } from '../components/Table.tsx';
import { Tag } from '../components/Tag.tsx';
import { TextInput } from '../components/TextInput.tsx';
import { Toast, ToastProvider, useToast } from '../components/Toast.tsx';
import { ToggleSwitch } from '../components/ToggleSwitch.tsx';
import { Tooltip } from '../components/Tooltip.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { MessageId } from '../i18n/translate.ts';
import { useUiStore } from '../state/ui.ts';
import menu from '../styles/menu.module.css';
import { SheetDialogs } from './SheetDialogs.tsx';
import styles from './Sheet.module.css';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.block}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  );
}
function Palette({ items }: { items: readonly (readonly [string, MessageId])[] }) {
  const { t } = useI18n();
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    setColors(
      Object.fromEntries(
        items.map(([token]) => [token, root.getPropertyValue(`--${token}`).trim()]),
      ),
    );
  }, [items]);
  return (
    <div className={styles.palette}>
      {items.map(([token, id]) => (
        <div key={token} className={styles.swatch}>
          <span className={styles.color} style={{ background: `var(--${token})` }} />
          <div>
            {t(id)}
            <div className={styles.caption}>{colors[token]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
const surfaceColors = [
  ['canvas', 'sheet.canvas'],
  ['panel', 'sheet.panel'],
  ['field', 'sheet.fields'],
  ['hover', 'sheet.hover'],
  ['divider', 'sheet.dividers'],
  ['control-border', 'sheet.borders'],
  ['text', 'sheet.bodyText'],
  ['secondary', 'sheet.secondaryText'],
  ['caption', 'sheet.captions'],
] as const;
const semanticColors = [
  ['primary', 'sheet.primaryColor'],
  ['is', 'sheet.is'],
  ['profit', 'sheet.profit'],
  ['loss', 'sheet.loss'],
  ['plot', 'sheet.plot'],
  ['unsupported', 'sheet.unsupportedColor'],
] as const;

export function Sheet() {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t('sheet.title');
  }, [t]);
  return (
    <ToastProvider label={t('sheet.toastRegion')} closeLabel={t('sheet.close')}>
      <SheetContent />
    </ToastProvider>
  );
}
function SheetContent() {
  const { t, language } = useI18n();
  const setLanguage = useUiStore((state) => state.setLanguage);
  const toast = useToast();
  const [numbers, setNumbers] = useState<Record<string, string>>({
    numeric: '20',
    focused: '28',
    error: '0',
    readonly: '14',
    from: '10',
    to: '50',
    step: '1',
    default: '28',
  });
  const [segment, setSegment] = useState('inOut');
  const [source, setSource] = useState('closeValue');
  const [objective, setObjective] = useState('netProfit');
  const [checked, setChecked] = useState(false);
  const [checkedOn, setCheckedOn] = useState(true);
  const [switched, setSwitched] = useState(false);
  const [switchedOn, setSwitchedOn] = useState(true);
  const [values, setValues] = useState(['closeValue', 'hl2', 'ohlc4']);
  const [filters, setFilters] = useState(['tradesFilter', 'badFilter'] as const as readonly (
    'tradesFilter' | 'badFilter'
  )[]);
  const [page, setPage] = useState('backtest');
  const [dock, setDock] = useState('report');
  const [selectedRow, setSelectedRow] = useState(1);
  const [markers, setMarkers] = useState(true);
  const sourceOptions = (
    ['closeValue', 'hl2', 'ohlc4', 'openValue', 'high', 'low', 'hlc3', 'hlcc4'] as const
  ).map((key) => ({ value: key, label: t(`sheet.${key}`) }));
  const number = (key: string, extra: Partial<React.ComponentProps<typeof NumberField>> = {}) => (
    <NumberField
      value={numbers[key]}
      onChange={(value) => setNumbers((previous) => ({ ...previous, [key]: value }))}
      label={t(`sheet.${key}` as MessageId)}
      decrementLabel={t('sheet.decrease')}
      incrementLabel={t('sheet.increase')}
      {...extra}
    />
  );
  const notify = (id: MessageId = 'sheet.copied') => toast.push({ message: t(id) });
  const run = (disabled = false, shortcut = true) => (
    <Button
      variant="primary"
      icon={<Icon name="play" size={11} />}
      shortcut={shortcut ? t('shell.shortcut') : undefined}
      disabled={disabled}
      disabledReason={t('shell.runMissing')}
      onClick={() => notify('sheet.applied')}
    >
      {t('shell.runBacktest')}
    </Button>
  );
  const cancel = (
    <Button
      icon={<Icon name="stop" size={11} />}
      onClick={() => toast.push({ message: t('sheet.cancelled'), tone: 'amber' })}
    >
      {t('sheet.cancel')}
    </Button>
  );
  const menuEntries: MenuEntry[] = [
    {
      id: 'leaderboard',
      label: t('sheet.leaderboardCsv'),
      icon: <Icon name="download" />,
      detail: t('sheet.rows'),
      onSelect: () => notify('sheet.exported'),
    },
    {
      id: 'trades',
      label: t('sheet.tradesCsv'),
      icon: <Icon name="download" />,
      onSelect: () => notify('sheet.exported'),
    },
    { id: 'separator', type: 'separator' },
    { id: 'heading', type: 'heading', label: t('sheet.values') },
    {
      id: 'copy',
      label: t('sheet.copyParameters'),
      icon: <Icon name="copy" />,
      onSelect: () => notify(),
    },
    { id: 'remove', label: t('sheet.destructive'), tone: 'danger', onSelect: () => setFilters([]) },
    { id: 'disabled', label: t('sheet.disabled'), disabled: true, onSelect: () => notify() },
  ];
  const objectiveGroups = [
    {
      label: t('sheet.returns'),
      options: (['netProfit', 'annualized', 'pf', 'avg'] as const).map((key) => ({
        value: key,
        label: t(`sheet.${key}`),
      })),
    },
    {
      label: t('sheet.risk'),
      options: (['drawdown', 'sharpe', 'sortino'] as const).map((key) => ({
        value: key,
        label: t(`sheet.${key}`),
      })),
    },
    {
      label: t('sheet.robustness'),
      options: [{ value: 'neighbourhood', label: t('sheet.neighbourhood') }],
    },
  ];
  const table = (variant: 'plain' | 'leaderboard') => (
    <Table
      variant={variant}
      caption={t(variant === 'plain' ? 'sheet.plainTable' : 'sheet.leaderboard')}
    >
      <thead>
        <tr>
          {(['rank', 'length', 'mult', 'net'] as const).map((key) => (
            <th key={key} scope="col">
              {t(`sheet.${key}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[1, 2, 3].map((rank) => (
          <tr key={rank} data-selected={selectedRow === rank}>
            <td>
              <button
                type="button"
                aria-label={t('sheet.selectedRow', { rank })}
                onClick={() => setSelectedRow(rank)}
              >
                {rank}
              </button>
            </td>
            <td>{rank === 1 ? 28 : rank === 2 ? 24 : 27}</td>
            <td>{t(rank === 3 ? 'sheet.thirdMult' : 'sheet.firstMult')}</td>
            <td className={styles.profit}>
              {t(rank === 1 ? 'sheet.firstNet' : rank === 2 ? 'sheet.secondNet' : 'sheet.thirdNet')}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
  return (
    <main className={styles.sheet}>
      <div className={styles.reference} data-testid="g5-sheet">
        <div className={styles.grid}>
          <Block title={t('sheet.surfaces')}>
            <Palette items={surfaceColors} />
          </Block>
          <Block title={t('sheet.semantic')}>
            <Palette items={semanticColors} />
            <div className={styles.ramp}>
              <p>{t('sheet.heat')}</p>
              <div>
                {Array.from({ length: 8 }, (_, index) => (
                  <span key={index} style={{ background: `var(--heat-${index + 1})` }} />
                ))}
              </div>
            </div>
          </Block>
          <Block title={t('sheet.type')}>
            <div className={styles.column}>
              <div className={styles.typeRow}>
                <span className={styles.figure}>{t('sheet.figure')}</span>
                <span>{t('sheet.figureType')}</span>
              </div>
              <div className={styles.typeRow}>
                <strong className={styles.dialogTitle}>{t('shell.selectData')}</strong>
                <span>{t('sheet.titleType')}</span>
              </div>
              <div className={styles.typeRow}>
                <strong>{t('optimize.searchRanges')}</strong>
                <span>{t('sheet.sectionType')}</span>
              </div>
              <div className={styles.typeRow}>
                <span>{t('sheet.bodySample')}</span>
                <span>{t('sheet.bodyType')}</span>
              </div>
              <div className={styles.typeRow}>
                <small>{t('sheet.runFacts')}</small>
                <span>{t('sheet.captionType')}</span>
              </div>
              <div className={styles.typeRow}>
                <code>{t('sheet.code')}</code>
                <span>{t('sheet.codeType')}</span>
              </div>
              <p className={styles.caption}>{t('sheet.fonts')}</p>
            </div>
          </Block>
        </div>
        <div className={styles.grid}>
          <Block title={t('sheet.inputs')}>
            <div className={styles.column}>
              <Row label={t('sheet.numeric')}>
                <div className={styles.field}>{number('numeric', { min: 5, max: 200 })}</div>
              </Row>
              <Row label={t('sheet.focused')}>
                <div className={`${styles.field} ${styles.focused}`}>{number('focused')}</div>
              </Row>
              <Row label={t('sheet.error')}>
                <div className={styles.field}>
                  {number('error', {
                    min: 0.25,
                    step: 0.25,
                    error: Number(numbers.error) < 0.25 ? t('sheet.minimum') : undefined,
                  })}
                </div>
              </Row>
              <Row label={t('sheet.readonly')}>
                <div className={styles.field}>{number('readonly', { readOnly: true })}</div>
                <span className={styles.expression}>
                  <Icon name="lock" size={11} />
                  {t('sheet.expression')}
                </span>
              </Row>
              <Row label={t('sheet.dropdown')}>
                <div className={styles.field}>
                  <Select
                    label={t('sheet.dropdown')}
                    value={source}
                    onChange={setSource}
                    options={sourceOptions}
                  />
                </div>
              </Row>
              <Row label={t('sheet.range')}>
                <div className={styles.rangeField}>
                  {number('from', { compact: true, stepper: false })}
                </div>
                <span className={styles.caption}>{t('sheet.to')}</span>
                <div className={styles.rangeField}>
                  {number('to', { compact: true, stepper: false })}
                </div>
                <span className={styles.caption}>{t('sheet.step')}</span>
                <div className={styles.stepField}>
                  {number('step', { compact: true, stepper: false })}
                </div>
              </Row>
            </div>
          </Block>
          <Block title={t('sheet.selection')}>
            <div className={styles.column}>
              <Row label={t('sheet.switch')}>
                <ToggleSwitch
                  label={t('sheet.off')}
                  checked={switched}
                  onCheckedChange={setSwitched}
                />
                <ToggleSwitch
                  label={t('sheet.on')}
                  checked={switchedOn}
                  onCheckedChange={setSwitchedOn}
                />
              </Row>
              <Row label={t('sheet.checkbox')}>
                <Checkbox
                  label={t('sheet.unchecked')}
                  checked={checked}
                  onCheckedChange={(value) => setChecked(value === true)}
                />
                <Checkbox
                  label={t('sheet.checked')}
                  checked={checkedOn}
                  onCheckedChange={(value) => setCheckedOn(value === true)}
                />
              </Row>
              <Row label={t('sheet.segment')}>
                <SegmentedControl
                  label={t('sheet.segment')}
                  value={segment}
                  onChange={setSegment}
                  options={(['none', 'inOut', 'walkForward'] as const).map((key) => ({
                    value: key,
                    label: t(`optimize.${key}`),
                  }))}
                />
              </Row>
              <Row label={t('sheet.values')}>
                {(['closeValue', 'hl2', 'openValue'] as const).map((key) => (
                  <Chip
                    key={key}
                    label={t(`sheet.${key}`)}
                    pressed={values.includes(key)}
                    onPressedChange={(on) =>
                      setValues((previous) =>
                        on ? [...previous, key] : previous.filter((value) => value !== key),
                      )
                    }
                  />
                ))}
              </Row>
              <Row label={t('sheet.chips')}>
                {filters.map((key) => (
                  <Chip
                    key={key}
                    label={t(`sheet.${key}`)}
                    bad={key === 'badFilter'}
                    removeLabel={t('sheet.remove', { label: t(`sheet.${key}`) })}
                    onRemove={() =>
                      setFilters((previous) => previous.filter((filter) => filter !== key))
                    }
                  />
                ))}
                <Chip
                  label={t('optimize.addCondition')}
                  dashed
                  onClick={() => setFilters(['tradesFilter', 'badFilter'])}
                />
              </Row>
              <Row label={t('sheet.badges')}>
                <Tag>{t('sheet.extra')}</Tag>
                <Tag tone="amber">{t('sheet.stale')}</Tag>
                <Tag tone="danger">{t('sheet.compileError')}</Tag>
                <Tag tone="blue">{t('sheet.unsupported')}</Tag>
              </Row>
            </div>
          </Block>
          <Block title={t('sheet.buttons')}>
            <div className={styles.column}>
              <Row label={t('sheet.primary')}>
                {run()}
                <Button
                  variant="primary"
                  className={styles.hoverPrimary}
                  icon={<Icon name="play" size={11} />}
                  onClick={() => notify('sheet.applied')}
                >
                  {t('optimize.start')}
                </Button>
                {run(true, false)}
              </Row>
              <Row label={t('sheet.secondary')}>
                <Button onClick={() => notify('sheet.applied')}>{t('sheet.reoptimize')}</Button>
                <Button className={styles.hover} onClick={() => notify('sheet.applied')}>
                  {t('sheet.fullBacktest')}
                </Button>
                {cancel}
              </Row>
              <Row label={t('sheet.icon')}>
                <IconButton
                  icon="download"
                  label={t('sheet.icon.download')}
                  onClick={() => notify('sheet.exported')}
                />
                <IconButton
                  icon="fit"
                  label={t('sheet.icon.fit')}
                  className={styles.hover}
                  onClick={() => notify()}
                />
                <IconButton
                  icon="marks"
                  label={t('sheet.icon.marks')}
                  active={markers}
                  onClick={() => setMarkers(!markers)}
                />
                <span className={styles.caption}>{t('sheet.iconStates')}</span>
              </Row>
              <Row label={t('sheet.links')}>
                <Button variant="link" onClick={() => notify()}>
                  {t('sheet.allSettings')}
                </Button>
                <Button variant="link" tone="danger" onClick={() => notify('sheet.workerError')}>
                  {t('sheet.failedView')}
                </Button>
              </Row>
              <Row label={t('sheet.menu')}>
                <div className={`${menu.menu} ${styles.menuPreview}`}>
                  {menuEntries
                    .filter(
                      (entry) =>
                        entry.id === 'leaderboard' || entry.id === 'trades' || entry.id === 'copy',
                    )
                    .map(
                      (entry) =>
                        entry.type !== 'heading' &&
                        entry.type !== 'separator' && (
                          <button
                            type="button"
                            key={entry.id}
                            onClick={entry.onSelect}
                            className={menu.item}
                          >
                            {entry.icon}
                            <span className={menu.label}>{entry.label}</span>
                            {entry.detail && <span className={menu.detail}>{entry.detail}</span>}
                          </button>
                        ),
                    )}
                </div>
              </Row>
            </div>
          </Block>
        </div>
        <div className={styles.runGrid}>
          <Block title={t('sheet.runStatus')}>
            <div className={styles.column}>
              <Row label={t('sheet.idle')}>
                <span className={styles.status}>{t('sheet.runFacts')}</span>
                {run()}
              </Row>
              <Row label={t('sheet.running')}>
                <span className={styles.status}>
                  <Icon name="spinner" />
                  {t('sheet.runningTime')}
                </span>
                {cancel}
              </Row>
              <Row label={t('sheet.stale')}>
                <span className={`${styles.status} ${styles.amber}`}>
                  <span className={styles.dot} />
                  {t('sheet.outdated')}
                </span>
                {run()}
              </Row>
              <Row label={t('sheet.failed')}>
                <span className={`${styles.status} ${styles.danger}`}>
                  {t('sheet.compileErrors')}
                </span>
                {run(true)}
              </Row>
              <Row label={t('sheet.done')}>
                <span className={styles.status}>
                  {t('sheet.optimizeFacts')}
                  <Button variant="link" tone="danger" onClick={() => notify('sheet.workerError')}>
                    {t('sheet.failedCount')}
                  </Button>
                </span>
                <Button onClick={() => notify('sheet.applied')}>{t('sheet.reoptimize')}</Button>
              </Row>
              <Row label={t('sheet.optimizing')}>
                <span className={styles.status}>
                  <Icon name="spinner" />
                  {t('sheet.optimizeProgress')}
                </span>
                {cancel}
              </Row>
            </div>
          </Block>
          <Block title={t('sheet.readyBlock')}>
            {[false, true].map((disabled) => (
              <div className={styles.runBlock} key={String(disabled)}>
                <div className={styles.runNumbers}>
                  <div>
                    <strong>{t(disabled ? 'common.unavailable' : 'sheet.comboCount')}</strong>
                    <span>{t('optimize.combos')}</span>
                  </div>
                  <span className={disabled ? styles.danger : styles.caption}>
                    {t(disabled ? 'sheet.fixErrors' : 'sheet.estimate')}
                  </span>
                </div>
                <Button
                  variant="primary"
                  disabled={disabled}
                  disabledReason={t('sheet.fixErrors')}
                  icon={<Icon name="play" size={11} />}
                  onClick={() => notify('sheet.applied')}
                >
                  {t('optimize.start')}
                </Button>
              </div>
            ))}
          </Block>
          <Block title={t('sheet.runningBlock')}>
            <div className={styles.progressBlock}>
              <div className={styles.progressHeading}>
                <Icon name="spinner" />
                <strong>{t('sheet.optimizing')}</strong>
                <span>{t('sheet.progressCount')}</span>
                <strong>{t('sheet.percent')}</strong>
              </div>
              <ProgressBar label={t('sheet.optimizing')} value={62} />
              <div className={styles.progressFooter}>
                <span>{t('sheet.elapsed')}</span>
                <span>{t('sheet.remaining')}</span>
                <span className={styles.caption}>{t('sheet.threads')}</span>
                {cancel}
              </div>
            </div>
          </Block>
        </div>
        <Block title={t('sheet.toasts')}>
          <div className={styles.toastExamples}>
            <Toast
              action={
                <Button className={styles.toastAction} onClick={() => notify('sheet.copied')}>
                  {t('sheet.undo')}
                </Button>
              }
            >
              {t('sheet.applied')}
            </Toast>
            <Toast>{t('sheet.copied')}</Toast>
            <Toast>{t('sheet.exported')}</Toast>
            <Toast tone="amber">{t('sheet.scriptChanged')}</Toast>
            <Toast tone="amber">{t('sheet.cancelled')}</Toast>
            <Toast
              tone="danger"
              action={
                <Button className={styles.toastAction} onClick={() => notify('sheet.applied')}>
                  {t('sheet.runAgain')}
                </Button>
              }
            >
              {t('sheet.workerError')}
            </Toast>
          </div>
        </Block>
      </div>
      <div className={styles.extensions}>
        <SectionHeading
          action={
            <SegmentedControl
              label={t('shell.language')}
              value={language}
              onChange={(value) => setLanguage(value === 'zh' ? 'zh' : 'en')}
              options={[
                { value: 'en', label: t('shell.english') },
                { value: 'zh', label: t('shell.chinese') },
              ]}
            />
          }
        >
          {t('sheet.extensions')}
        </SectionHeading>
        <div className={styles.extraGrid}>
          <Block title={t('sheet.inputs')}>
            <FieldRow label={t('sheet.length')} hint={t('sheet.default', { value: 14 })}>
              {(props) =>
                number('default', { ...props, label: t('sheet.length'), min: 1, max: 200 })
              }
            </FieldRow>
            <FieldRow label={t('sheet.metric')}>
              {(props) => (
                <Select
                  {...props}
                  label={t('sheet.metric')}
                  value={objective}
                  onChange={setObjective}
                  options={objectiveGroups}
                />
              )}
            </FieldRow>
            <ChipOverflow
              options={sourceOptions}
              values={values}
              onChange={setValues}
              title={t('sheet.sourceValues')}
              moreLabel={(count) => t('sheet.more', { count })}
              summary={t('sheet.selected', { count: values.length })}
              hint={t('sheet.fixedHint')}
            />
            <TextInput
              aria-label={t('sheet.disabled')}
              defaultValue={t('sheet.expression')}
              disabled
            />
            <SegmentedControl
              label={t('sheet.disabled')}
              value="none"
              disabled
              small
              options={[
                { value: 'none', label: t('optimize.none') },
                { value: 'inOut', label: t('optimize.inOut') },
              ]}
            />
            <div className={styles.flex}>
              <ToggleSwitch label={t('sheet.disabled')} checked disabled />
              <Checkbox label={t('sheet.disabled')} checked="indeterminate" disabled />
              <Chip label={t('sheet.disabled')} disabled />
              <Select
                label={t('sheet.disabled')}
                value={source}
                onChange={setSource}
                options={sourceOptions}
                disabled
              />
            </div>
            <Button loading>{t('sheet.loading')}</Button>
            <Button tone="danger" onClick={() => setFilters([])}>
              {t('sheet.destructive')}
            </Button>
            <ProgressBar label={t('sheet.indeterminate')} />
          </Block>
          <Block title={t('sheet.notes')}>
            <Note>{t('sheet.providerLimit')}</Note>
            <Note tone="amber" icon={<Icon name="warning" />}>
              {t('sheet.yahooNote')}
            </Note>
            <Note tone="danger" icon={<Icon name="error" />}>
              {t('sheet.refusal')}
            </Note>
            <Banner
              title={t('sheet.staleTitle')}
              actions={
                <Button
                  variant="link"
                  onClick={() => setNumbers((previous) => ({ ...previous, numeric: '20' }))}
                >
                  {t('sheet.reset20')}
                </Button>
              }
            >
              {t('sheet.staleBody')}
            </Banner>
            <Banner
              title={t('sheet.previewTitle')}
              actions={
                <>
                  <Button variant="link" onClick={() => setPage('optimize')}>
                    {t('sheet.backOptimization')}
                  </Button>
                  <Button variant="primary" onClick={() => notify('sheet.applied')}>
                    {t('sheet.applyInputs')}
                  </Button>
                </>
              }
            >
              {t('sheet.previewBody')}
            </Banner>
            <div className={styles.flex}>
              <Button onClick={() => notify()}>{t('sheet.showToast')}</Button>
              <Button
                onClick={() =>
                  toast.push({
                    message: t('sheet.applied'),
                    action: {
                      label: t('sheet.undo'),
                      altText: t('sheet.undoHint'),
                      onClick: () => notify('sheet.copied'),
                    },
                  })
                }
              >
                {t('sheet.showActionToast')}
              </Button>
            </div>
          </Block>
          <Block title={t('sheet.tables')}>
            <KeyValueRow label={t('sheet.initialCapital')}>{t('sheet.capital')}</KeyValueRow>
            <KeyValueRow label={t('sheet.orderSize')}>{t('sheet.orderValue')}</KeyValueRow>
            {table('plain')}
            {table('leaderboard')}
          </Block>
          <Block title={t('sheet.dialogs')}>
            <SheetDialogs />
            <DropdownMenu
              label={t('sheet.menu')}
              entries={menuEntries}
              trigger={<Button icon={<Icon name="download" />}>{t('sheet.menu')}</Button>}
            />
            <Tooltip content={t('sheet.fixedHint')}>
              <Button>{t('sheet.expression')}</Button>
            </Tooltip>
          </Block>
          <Block title={t('sheet.tabStates')}>
            <PageTabs
              label={t('shell.pages')}
              value={page}
              onChange={setPage}
              options={[
                { value: 'backtest', label: t('shell.backtest') },
                { value: 'optimize', label: t('shell.optimize') },
              ]}
            />
            <div className={styles.dock}>
              <DockTabs
                label={t('dock.tabs')}
                value={dock}
                onChange={setDock}
                options={[
                  { value: 'report', label: t('dock.report') },
                  { value: 'trades', label: t('dock.trades'), count: 143 },
                  { value: 'issues', label: t('dock.issues'), count: 2, bad: true },
                  { value: 'code', label: t('dock.code'), disabled: true },
                ]}
              >
                <p className={styles.caption}>{t('backtest.resultsHint')}</p>
              </DockTabs>
            </div>
            <EmptyState
              title={t('sheet.empty')}
              actions={<Button onClick={() => setFilters([])}>{t('sheet.destructive')}</Button>}
            >
              {t('sheet.emptyBody')}
            </EmptyState>
          </Block>
          <Block title={t('sheet.allIcons')}>
            <div className={styles.icons}>
              {iconNames.map((name) => (
                <div key={name}>
                  <Icon name={name} size={18} label={t(`sheet.icon.${name}`)} />
                  <span>{t(`sheet.icon.${name}`)}</span>
                </div>
              ))}
            </div>
          </Block>
        </div>
      </div>
    </main>
  );
}
