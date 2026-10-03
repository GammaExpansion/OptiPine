import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Icon, type IconName } from '../../../components/Icon.tsx';
import { Tag } from '../../../components/Tag.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { MessageId } from '../../../i18n/translate.ts';
import { useBacktestStore } from '../../../state/backtest.ts';
import { useSelectionStore } from '../../../state/selection.ts';
import {
  backtestIssues,
  type BacktestState,
  type Issue,
  type IssueCategory,
} from '../../../workflows/backtest.ts';
import { LazyPineEditor } from '../code/LazyPineEditor.tsx';
import { useCodeAnnotations } from '../code/useCodeAnnotations.ts';
import empty from './EmptyTab.module.css';
import styles from './IssuesTab.module.css';

const categories: Record<
  IssueCategory,
  { label: MessageId; icon: IconName; tone: 'danger' | 'blue' | 'amber' }
> = {
  compileError: { label: 'issues.compileError', icon: 'error', tone: 'danger' },
  unsupported: { label: 'issues.unsupported', icon: 'unsupported', tone: 'blue' },
  runtimeError: { label: 'issues.runtimeError', icon: 'error', tone: 'danger' },
  limit: { label: 'issues.limit', icon: 'error', tone: 'danger' },
  engineFault: { label: 'issues.engineFault', icon: 'error', tone: 'danger' },
  workerError: { label: 'issues.workerError', icon: 'error', tone: 'danger' },
  ignoredEffect: { label: 'issues.ignoredEffect', icon: 'warning', tone: 'amber' },
};

/** The explanations under the list, one per kind of issue present (B10). */
function notes(issues: readonly Issue[]): MessageId[] {
  const has = (...kinds: IssueCategory[]) => issues.some((issue) => kinds.includes(issue.category));
  const result: MessageId[] = [];
  if (has('compileError'))
    result.push(has('unsupported') ? 'issues.fixUnsupported' : 'issues.fixToRun');
  else if (has('unsupported')) result.push('issues.unsupportedNote');
  if (has('runtimeError', 'limit', 'workerError')) result.push('issues.incompleteNote');
  if (has('engineFault')) result.push('issues.engineFaultNote');
  if (has('ignoredEffect')) result.push('issues.ignoredNote');
  return result;
}

/**
 * The Issues tab: compile errors, unsupported features, runtime errors and ignored effects. The
 * code beside the list follows the row under the pointer or focus; a row opens its line in the
 * Pine code tab.
 */
export function IssuesTab() {
  const { t, text } = useI18n();
  const parts = useBacktestStore(
    useShallow((state) => ({
      compile: state.compile,
      run: state.run,
      result: state.result,
      preview: state.preview,
    })),
  );
  const issues = useMemo(() => backtestIssues(parts as BacktestState), [parts]);
  const source = useBacktestStore((state) => state.source);
  const revealCodeLine = useSelectionStore((state) => state.revealCodeLine);
  const annotations = useCodeAnnotations(false);
  const [pointed, setPointed] = useState(0);
  if (!issues.length) return <div className={empty.empty}>{t('backtest.issuesHint')}</div>;
  const active = Math.min(pointed, issues.length - 1);
  const line = issues[active].line ?? issues.find((issue) => issue.line !== null)?.line ?? null;
  const location = (issue: Issue) => {
    if (issue.line === null) return null;
    if (issue.bar !== null) return t('issues.lineBar', { line: issue.line, bar: issue.bar + 1 });
    if (issue.column !== null)
      return t('issues.lineColumn', { line: issue.line, column: issue.column });
    return t('issues.line', { line: issue.line });
  };
  return (
    <div className={styles.issues}>
      <div className={styles.side}>
        <ul className={styles.list} aria-label={t('issues.list')}>
          {issues.map((issue, index) => {
            const category = categories[issue.category];
            const content = (
              <>
                <Icon name={category.icon} size={14} className={styles.icon} />
                <span className={styles.copy}>
                  <span className={styles.heading}>
                    <Tag tone={category.tone}>{t(category.label)}</Tag>
                    <span className={styles.location}>{location(issue)}</span>
                  </span>
                  <span className={styles.message}>{text(issue.text)}</span>
                </span>
              </>
            );
            return (
              <li key={index}>
                {issue.line === null ? (
                  <div className={styles.row}>{content}</div>
                ) : (
                  <button
                    type="button"
                    className={styles.row}
                    data-active={index === active || undefined}
                    onPointerEnter={() => setPointed(index)}
                    onFocus={() => setPointed(index)}
                    onClick={() => revealCodeLine(issue.line!)}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className={styles.notes}>
          {notes(issues).map((id) => (
            <p key={id}>{t(id)}</p>
          ))}
        </div>
      </div>
      {line !== null && (
        <LazyPineEditor
          className={styles.excerpt}
          readOnly
          source={source}
          annotations={annotations}
          label={t('issues.excerpt', { line })}
          emptyText={t('backtest.codePlaceholder')}
          reveal={{ line, seq: 0 }}
        />
      )}
    </div>
  );
}
