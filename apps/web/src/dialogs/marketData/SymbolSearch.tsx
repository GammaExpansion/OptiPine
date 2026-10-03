import { useEffect, useId, useState } from 'react';
import type { Feed, FeedSymbol } from '@pine/market-data';
import { errorText, type Text } from '@pine/messages';
import { Icon } from '../../components/Icon.tsx';
import { Note } from '../../components/Note.tsx';
import { TextInput } from '../../components/TextInput.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { getServices } from '../../state/services.ts';
import styles from './DataDialog.module.css';

/** Remote search owns its query, cancellation and keyboard navigation; a selection invalidates the preview. */
export function SymbolSearch({
  feed,
  value,
  disabled,
  onChange,
}: {
  feed: Feed;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t, text } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<FeedSymbol[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Text | null>(null);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, id, open]);
  useEffect(() => {
    setResults([]);
    setActive(0);
    if (!open || disabled || !value.trim()) {
      setLoading(false);
      return;
    }
    setFailure(null);
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void getServices()
        .feed.search(feed, value.trim(), controller.signal)
        .then((symbols) => {
          if (!controller.signal.aborted) setResults(symbols);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setFailure(errorText(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, feed, open, value]);
  const choose = (symbol: string) => {
    onChange(symbol);
    setOpen(false);
  };
  return (
    <div className={styles.search}>
      <label className={styles.label} htmlFor={id}>
        {t('data.symbol')}
      </label>
      <TextInput
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && results[active] ? `${id}-${active}` : undefined}
        icon={<Icon name="search" />}
        disabled={disabled}
        value={value}
        placeholder={t('data.searchSymbols')}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value.toUpperCase());
          setOpen(true);
        }}
        onKeyDown={(event) => {
          // Remove suggestions before native Tab moves focus; removing them during blur can
          // make the dialog's focus scope recover to the dialog instead of the next control.
          if (event.key === 'Tab') setOpen(false);
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              Math.max(
                0,
                Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
              ),
            );
          }
          if (event.key === 'Enter' && open && results[active]) {
            event.preventDefault();
            choose(results[active].symbol);
          }
          if (open && ['Home', 'End'].includes(event.key)) {
            event.preventDefault();
            setActive(event.key === 'Home' ? 0 : Math.max(0, results.length - 1));
          }
        }}
      />
      {open && value && (
        <div
          className={styles.results}
          role="listbox"
          id={`${id}-list`}
          aria-label={t('data.searchSymbols')}
        >
          {results.map((result, index) => (
            <div
              key={result.symbol}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              className={styles.result}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(result.symbol)}
            >
              <strong>{result.symbol}</strong>
              <span>{result.name}</span>
              <small>
                {feed === 'yahoo'
                  ? result.exchange
                  : t(feed === 'binance' ? 'data.spot' : 'data.perpetual')}
              </small>
            </div>
          ))}
          {!results.length && (
            <div className={styles.searchHint}>
              {failure ? text(failure) : t(loading ? 'data.searching' : 'data.noSymbols')}
            </div>
          )}
        </div>
      )}
      {!open && failure && (
        <Note tone="danger" role="alert">
          {text(failure)}
        </Note>
      )}
    </div>
  );
}
