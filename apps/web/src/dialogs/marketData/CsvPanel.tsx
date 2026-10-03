import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionCalendar } from '@pine/engine';
import { message, type Text } from '@pine/messages';
import { Button } from '../../components/Button.tsx';
import { FieldRow } from '../../components/FieldRow.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Note } from '../../components/Note.tsx';
import { Select } from '../../components/Select.tsx';
import { TextInput } from '../../components/TextInput.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { type DatasetInput } from '../../workflows/backtest.ts';
import { calendarFromJson, csvInput, inspectCsv, type CsvInspection } from './csv-import.ts';
import { defaultProfile, ProfileFields } from './ProfileFields.tsx';
import { PreviewSummary } from './PreviewSummary.tsx';
import styles from './DataDialog.module.css';

export interface CsvReady {
  input: DatasetInput;
  fileName: string;
}
export function CsvPanel({ onReady }: { onReady: (value: CsvReady | null) => void }) {
  const { t, text } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const calendarInput = useRef<HTMLInputElement>(null);
  const csvVersion = useRef(0),
    calendarVersion = useRef(0);
  const [fileName, setFileName] = useState('');
  const [inspection, setInspection] = useState<CsvInspection>({ dataset: null, issues: [] });
  const [fileError, setFileError] = useState<Text | null>(null);
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('60');
  const [type, setType] = useState('crypto');
  const [profile, setProfile] = useState(defaultProfile);
  const [calendar, setCalendar] = useState<SessionCalendar>();
  const [calendarName, setCalendarName] = useState('');
  const [calendarError, setCalendarError] = useState<Text | null>(null);
  const [pending, setPending] = useState(false),
    [calendarPending, setCalendarPending] = useState(false);
  const validated = useMemo(
    () => csvInput(inspection.dataset, symbol, timeframe, type, profile, calendar),
    [inspection, symbol, timeframe, type, profile, calendar],
  );
  useEffect(() => {
    onReady(
      !pending && !calendarPending && !calendarError && !fileError && validated.input
        ? { input: validated.input, fileName }
        : null,
    );
  }, [pending, calendarPending, calendarError, fileError, validated, fileName, onReady]);
  useEffect(
    () => () => {
      csvVersion.current++;
      calendarVersion.current++;
    },
    [],
  );
  const readCsv = async (file?: File) => {
    if (!file) return;
    const version = ++csvVersion.current;
    setPending(true);
    setFileName(file.name);
    setFileError(null);
    setInspection({ dataset: null, issues: [] });
    onReady(null);
    try {
      const result = inspectCsv(await file.text());
      if (version !== csvVersion.current) return;
      setInspection(result);
      if (result.dataset) setTimeframe(result.dataset.timeframe);
    } catch {
      if (version === csvVersion.current) setFileError(message('csv.fileError'));
    } finally {
      if (version === csvVersion.current) setPending(false);
    }
  };
  const readCalendar = async (file?: File) => {
    if (!file) return;
    const version = ++calendarVersion.current;
    setCalendarPending(true);
    setCalendar(undefined);
    setCalendarName(file.name);
    setCalendarError(null);
    onReady(null);
    try {
      const result = calendarFromJson(await file.text());
      if (version === calendarVersion.current) {
        setCalendar(result.calendar);
        setCalendarError(result.error);
      }
    } catch {
      if (version === calendarVersion.current) setCalendarError(message('csv.fileError'));
    } finally {
      if (version === calendarVersion.current) setCalendarPending(false);
    }
  };
  return (
    <div className={styles.columns}>
      <div className={styles.left}>
        <input
          ref={fileInput}
          hidden
          aria-label={t('csv.file')}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            void readCsv(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <input
          ref={calendarInput}
          hidden
          aria-label={t('csv.calendar')}
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            void readCalendar(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <div
          className={styles.dropzone}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void readCsv(event.dataTransfer.files[0]);
          }}
        >
          <div className={styles.row}>
            <Icon name="file" size={18} />
            <div className={styles.grow}>
              <strong className={styles.fileName}>{fileName || t('data.uploadCsv')}</strong>
              <div className={styles.muted}>
                {pending
                  ? t('csv.reading')
                  : inspection.dataset
                    ? t('csv.rows', { count: inspection.dataset.bars.length })
                    : inspection.issues.length
                      ? t('csv.errors', { count: inspection.issues.length })
                      : ''}
              </div>
            </div>
            <Button onClick={() => fileInput.current?.click()}>
              {t(fileName ? 'csv.changeFile' : 'csv.chooseFile')}
            </Button>
          </div>
          <span className={styles.muted}>{t('csv.hint')}</span>
        </div>
        {fileError && <Note tone="danger">{text(fileError)}</Note>}
        <div className={styles.grid}>
          <FieldRow label={t('data.symbol')}>
            {(props) => (
              <TextInput
                {...props}
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              />
            )}
          </FieldRow>
          <FieldRow label={t('data.timeframe')} hint={t('csv.timeframeHint')}>
            {(props) => (
              <TextInput
                {...props}
                value={timeframe}
                onChange={(event) => setTimeframe(event.target.value)}
              />
            )}
          </FieldRow>
        </div>
        <FieldRow label={t('csv.type')}>
          <Select
            label={t('csv.type')}
            value={type}
            onChange={setType}
            options={['crypto', 'stock', 'fund', 'index', 'forex', 'futures'].map((value) => ({
              value,
              label: t(`csv.type.${value}` as 'csv.type.crypto'),
            }))}
          />
        </FieldRow>
        <div className={styles.stack}>
          <span>{t('csv.calendar')}</span>
          <div className={styles.row}>
            <Button onClick={() => calendarInput.current?.click()}>
              {t('csv.chooseCalendar')}
            </Button>
            <span className={styles.muted}>{calendarName || t('csv.calendarHint')}</span>
          </div>
          {calendarName && (
            <Button
              variant="link"
              onClick={() => {
                calendarVersion.current++;
                setCalendarPending(false);
                setCalendarName('');
                setCalendar(undefined);
                setCalendarError(null);
              }}
            >
              {t('csv.removeCalendar')}
            </Button>
          )}
        </div>
        {calendarError && (
          <Note tone="danger" role="alert">
            {text(calendarError)}
          </Note>
        )}
      </div>
      <div className={styles.right}>
        {inspection.issues.length ? (
          <>
            <div className={styles.previewHead}>
              <strong>{t('csv.failed')}</strong>
              <span className={styles.muted}>{t('csv.fix')}</span>
            </div>
            <div className={styles.errorList}>
              {inspection.issues.map((issue) => (
                <div key={issue.line} className={styles.csvIssue}>
                  <Note tone="danger">
                    <strong>{t('csv.row', { line: issue.line })}</strong>
                    {t('data.separator')}
                    {text(issue.rule)}
                  </Note>
                  <pre>{issue.raw}</pre>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {inspection.dataset ? (
              <PreviewSummary
                input={{
                  ...inspection.dataset,
                  syminfo: { ticker: symbol },
                  timeframe,
                  sessionCalendar: calendar,
                }}
                badge={t('csv.fromFile')}
              />
            ) : (
              <div className={styles.empty}>{t('csv.previewHint')}</div>
            )}
            <ProfileFields
              manual
              values={profile}
              errors={validated.errors}
              onChange={(key, value) => setProfile((current) => ({ ...current, [key]: value }))}
            />
            {validated.error && fileName && (
              <Note tone="danger" role="alert">
                {text(validated.error)}
              </Note>
            )}
          </>
        )}
      </div>
    </div>
  );
}
