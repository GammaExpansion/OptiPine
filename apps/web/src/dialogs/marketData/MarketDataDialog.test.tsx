import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { StrictMode } from 'react';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { getBacktestStore } from '../../state/backtest.ts';
import { getMarketDataStore } from '../../state/marketData.ts';
import { replaceServices } from '../../state/services.ts';
import { fakeServices, testDataset, testInput, testNow } from '../../state/test-support.ts';
import { uiStore } from '../../state/ui.ts';
import { DialogsRoot } from '../../shell/DialogsRoot.tsx';
import { HeaderData } from '../../shell/HeaderData.tsx';
import { exampleRequest } from '../../workflows/market-data.ts';

let restore: () => void;
// Compile lazy chunks before timing dialog behavior, including on a busy multi-worktree host.
beforeAll(async () => {
  await Promise.all([import('./MarketDataDialog.tsx'), import('../dateRange/DateRangeDialog.tsx')]);
});
beforeEach(() => {
  localStorage.clear();
  restore = replaceServices(() => fakeServices());
  uiStore.setState({ language: 'en', openDialogs: ['marketData'] });
});
afterEach(() => {
  cleanup();
  restore();
  vi.useRealTimers();
});
/** The header and the open dialog, once its lazily loaded chunk is in. */
async function mount() {
  const view = render(
    <I18nProvider>
      <HeaderData />
      <DialogsRoot />
    </I18nProvider>,
  );
  await screen.findByRole('dialog');
  return view;
}
function file(name: string, raw: string) {
  const value = new File([raw], name);
  Object.defineProperty(value, 'text', { value: async () => raw });
  return value;
}

const csv =
  'time,open,high,low,close,Volume\n1790935200,100,103,99,102,5\n1790938800,102,104,101,103,6';

test('accepted example requests reopen with the matching preset in both data dialogs', async () => {
  const actions = getMarketDataStore().getState().actions;
  await actions.fetch(exampleRequest(testNow));
  actions.accept();
  await mount();
  expect(screen.getByRole('button', { name: '2Y' })).toHaveAttribute('aria-pressed', 'true');
  act(() => {
    uiStore.getState().setDialogOpen('marketData', false);
    uiStore.getState().setDialogOpen('dateRange', true);
  });
  await screen.findByRole('dialog');
  expect(await screen.findByRole('button', { name: '2Y' })).toHaveAttribute('aria-pressed', 'true');
});

test('StrictMode preserves an incoming refetch and real unmount clears its preview', async () => {
  let resolve!: (response: Response) => void;
  restore();
  restore = replaceServices(() =>
    fakeServices({
      fetcher: () =>
        new Promise((done) => {
          resolve = done;
        }),
    }),
  );
  const actions = getMarketDataStore().getState().actions;
  const pending = actions.fetch(exampleRequest(testNow));
  const mounted = render(
    <StrictMode>
      <I18nProvider>
        <DialogsRoot />
      </I18nProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(resolve).toBeDefined());
  await screen.findByRole('dialog');
  expect(getMarketDataStore().getState().fetch.status).toBe('fetching');
  await act(async () => {
    resolve(Response.json(testDataset));
    await pending;
  });
  expect(screen.getByRole('button', { name: 'Use this data' })).toBeEnabled();
  expect(screen.getByText('120', { exact: true })).toBeVisible();
  mounted.unmount();
  await waitFor(() => expect(getMarketDataStore().getState().fetch.status).toBe('idle'));
});

test('only Use this data installs the preview; invalid profile edits block it', async () => {
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Fetch data' }));
  await screen.findByText('120', { exact: true });
  expect(getBacktestStore().getState().dataset).toBeNull();
  const tick = screen.getByLabelText('Tick size');
  await user.clear(tick);
  expect(screen.getByRole('button', { name: 'Use this data' })).toBeDisabled();
  await user.type(tick, '0.5');
  await user.click(screen.getByRole('button', { name: 'Use this data' }));
  expect(getBacktestStore().getState().dataset!.input.syminfo.mintick).toBe(0.5);
  expect(getMarketDataStore().getState().origin).toMatchObject({
    kind: 'provider',
    request: { symbol: 'BTCUSDT', timeframe: '60' },
  });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(JSON.parse(localStorage.getItem('optipine.marketSelection')!)).toMatchObject({
    symbol: 'BTCUSDT',
    preset: '2Y',
  });
});

test('changing tabs cancels pending provider work and ignores its late response', async () => {
  let resolve!: (response: Response) => void;
  restore();
  restore = replaceServices(() =>
    fakeServices({
      fetcher: () =>
        new Promise((done) => {
          resolve = done;
        }),
    }),
  );
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Fetch data' }));
  await waitFor(() => expect(resolve).toBeDefined());
  await user.click(screen.getByRole('tab', { name: 'Upload CSV' }));
  await act(async () => resolve(Response.json(testDataset)));
  expect(getMarketDataStore().getState().fetch.status).toBe('idle');
  expect(getBacktestStore().getState().dataset).toBeNull();
  expect(screen.getByRole('button', { name: 'Use this data' })).toBeDisabled();
});

test('closing the dialog aborts a fetch without replacing accepted data', async () => {
  let aborted = false;
  restore();
  restore = replaceServices(() =>
    fakeServices({
      fetcher: async (_url, options) =>
        new Promise<Response>(() => {
          options!.signal!.addEventListener('abort', () => {
            aborted = true;
          });
        }),
    }),
  );
  getMarketDataStore().getState().actions.useCsv(testInput, 'prior.csv');
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: /Binance/ }));
  await user.click(screen.getByRole('button', { name: 'Fetch data' }));
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(aborted).toBe(true);
  expect(getMarketDataStore().getState().origin).toEqual({ kind: 'csv', fileName: 'prior.csv' });
});

test('progress advances on its timer and disappears on cancellation', async () => {
  restore();
  restore = replaceServices(() =>
    fakeServices({ now: Date.now, fetcher: async () => new Promise<Response>(() => {}) }),
  );
  await mount();
  vi.useFakeTimers();
  vi.setSystemTime(testNow);
  act(() => {
    void getMarketDataStore().getState().actions.fetch(exampleRequest(testNow));
  });
  act(() => vi.advanceTimersByTime(2000));
  expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  expect(screen.getByRole('progressbar')).toHaveAccessibleName('Fetching about 17,520 bars');
  act(() => getMarketDataStore().getState().actions.cancel());
  expect(screen.queryByRole('progressbar')).toBeNull();
});

test('search is abortable, chooses results with the keyboard and reports search errors', async () => {
  const signals: AbortSignal[] = [];
  restore();
  restore = replaceServices(() =>
    fakeServices({
      fetcher: async (url, options) => {
        signals.push(options!.signal as AbortSignal);
        return String(url).includes('q=FAIL')
          ? new Response('missing', { status: 404 })
          : Response.json({
              symbols: [
                { symbol: 'BTCUSDT', name: 'BTC / USDT', exchange: 'Binance', type: 'crypto' },
              ],
            });
      },
    }),
  );
  await mount();
  const user = userEvent.setup();
  const search = screen.getByRole('combobox', { name: 'Symbol' });
  await user.clear(search);
  await user.type(search, 'BTCUS');
  await screen.findByRole('option', { name: /BTCUSDT/ });
  await user.keyboard('{Enter}');
  expect(search).toHaveValue('BTCUSDT');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(signals[0].aborted).toBe(true);
  await user.clear(search);
  await user.type(search, 'FAIL');
  await screen.findByText('The data service is unavailable. Upload a CSV instead.');
});

test('CSV uses edited metadata and calendar only after all validation passes', async () => {
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Upload CSV' }));
  await user.upload(screen.getByLabelText('CSV file'), file('local.csv', csv));
  await user.type(screen.getByRole('textbox', { name: 'Symbol' }), 'CSVTEST');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use this data' })).toBeEnabled());
  await user.upload(
    screen.getByLabelText('Trading calendar JSON (optional)'),
    file('bad.json', '{}'),
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use this data' })).toBeDisabled());
  await user.click(screen.getByRole('button', { name: 'Remove calendar' }));
  const point = screen.getByLabelText('Point value');
  await user.clear(point);
  await user.type(point, '10');
  await user.click(screen.getByRole('button', { name: 'Use this data' }));
  expect(getBacktestStore().getState().dataset!.input).toMatchObject({
    timeframe: '60',
    syminfo: { ticker: 'CSVTEST', pointvalue: 10 },
  });
  expect(getMarketDataStore().getState().origin).toEqual({ kind: 'csv', fileName: 'local.csv' });
  expect(screen.getByRole('radio', { name: '4h' })).toBeDisabled();
});

test('CSV shows all failed rows beside raw records and handles dropped files', async () => {
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Upload CSV' }));
  const raw = `${csv}\n1790938800,1,2,0,1,1\n1790942400,1,2,0,1,-1`;
  fireEvent.drop(screen.getByText(/Drop a TradingView/).parentElement!, {
    dataTransfer: { files: [file('bad.csv', raw)] },
  });
  await screen.findByText('Row 4');
  expect(screen.getByText('Row 5')).toBeVisible();
  expect(screen.getByText('1790942400,1,2,0,1,-1')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use this data' })).toBeDisabled();
});

test('date range validates Custom and opens a provider preview without installing it', async () => {
  const actions = getMarketDataStore().getState().actions;
  await actions.fetch(exampleRequest(testNow));
  actions.accept();
  uiStore.setState({ openDialogs: ['dateRange'] });
  await mount();
  const user = userEvent.setup();
  const before = getBacktestStore().getState().dataset;
  await user.clear(screen.getByLabelText('From'));
  await user.type(screen.getByLabelText('From'), 'bad');
  expect(screen.getByRole('button', { name: 'Fetch again' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '2Y' }));
  await user.click(screen.getByRole('button', { name: 'Fetch again' }));
  await screen.findByRole('button', { name: 'Use this data' });
  expect(getBacktestStore().getState().dataset).toBe(before);
});

test('Chinese unavailable state keeps CSV accessible after switching providers', async () => {
  restore();
  restore = replaceServices(() =>
    fakeServices({ fetcher: async () => new Response('missing', { status: 404 }) }),
  );
  uiStore.setState({ language: 'zh' });
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '获取数据' }));
  await screen.findByText('数据服务不可用。请改用 CSV。');
  await user.click(screen.getByRole('tab', { name: /Yahoo Finance/ }));
  expect(screen.getByRole('combobox', { name: '品种' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '上传 CSV' }));
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: '选择文件' }),
  ).toBeVisible();
});

test('Yahoo daily All and old Custom ranges stay fetchable; intraday Custom explains its limit', async () => {
  await mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: /Yahoo Finance/ }));
  expect(screen.getByText(/730 days for 1h; 60 days/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: '2Y' }));
  expect(screen.getByLabelText('From')).toHaveValue('2024-10-03');
  expect(screen.queryByText(/This preset is shortened/)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'All' }));
  expect(screen.getByLabelText('From')).toHaveValue('1970-01-01');
  expect(screen.getByRole('button', { name: 'Fetch data' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Custom' }));
  await user.clear(screen.getByLabelText('From'));
  await user.type(screen.getByLabelText('From'), '1993-01-29');
  expect(screen.getByRole('button', { name: 'Fetch data' })).toBeEnabled();
  const timeframe = screen.getByRole('radiogroup', { name: 'Timeframe' });
  await user.click(within(timeframe).getByRole('radio', { name: '15m' }));
  expect(screen.getByRole('alert')).toHaveTextContent('last 60 days');
  expect(screen.getByRole('button', { name: 'Fetch data' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'All' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Fetch data' })).toBeEnabled();
});

test('a Yahoo preview discloses estimated older session closes', async () => {
  restore();
  restore = replaceServices(() =>
    fakeServices({
      fetcher: async () => Response.json({ ...testDataset, calendarEstimated: true }),
    }),
  );
  await mount();
  await userEvent.click(screen.getByRole('button', { name: 'Fetch data' }));
  expect(await screen.findByText(/Older daily session closes are estimated/)).toBeVisible();
});
