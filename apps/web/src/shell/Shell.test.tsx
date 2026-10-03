import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup } from '@testing-library/react';
import { replaceServices } from '../state/services.ts';
import { fakeServices } from '../state/test-support.ts';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { defaultPaneSizes, uiStorageKey, uiStore } from '../state/ui.ts';
import { Shell } from './Shell.tsx';

let restoreServices: () => void;
beforeEach(() => {
  restoreServices = replaceServices(() => fakeServices());
  localStorage.clear();
  uiStore.setState({
    page: 'backtest',
    dockTab: 'code',
    language: 'en',
    openDialogs: [],
    paneSizes: { backtest: { ...defaultPaneSizes }, optimize: { ...defaultPaneSizes } },
  });
});

afterEach(() => {
  cleanup();
  restoreServices();
});

test('the empty workbench blocks Optimize and explains both disabled run actions', async () => {
  render(
    <I18nProvider>
      <Shell />
    </I18nProvider>,
  );
  expect(screen.getByRole('button', { name: 'Optimize' })).toBeDisabled();
  for (const button of screen.getAllByRole('button', { name: /Run backtest/ })) {
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Open a script and select market data first');
  }
  const run = screen.getByRole('button', { name: /Ctrl/ });
  expect(run).toHaveAttribute('aria-keyshortcuts', 'Control+Enter');
  expect(screen.getByRole('tab', { name: 'Pine code' })).toHaveAttribute('aria-selected', 'true');
});

test('ready workspaces switch pages with the keyboard and restore the backtest dock tab', async () => {
  const user = userEvent.setup();
  // jsdom's zero-sized separators all sit at (0, 0); keep synthetic clicks outside their hit area.
  await user.pointer({ coords: { clientX: 500, clientY: 500 } });
  render(
    <I18nProvider>
      <Shell canOptimize />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('tab', { name: 'Report' }));
  expect(uiStore.getState().dockTab).toBe('report');
  screen.getByRole('button', { name: 'Optimize' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  expect(screen.queryByRole('tab', { name: 'Report' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Backtest' }));
  expect(screen.getByRole('tab', { name: 'Report' })).toHaveAttribute('aria-selected', 'true');
  screen.getByRole('tab', { name: 'Report' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Equity' })).toHaveAttribute('aria-selected', 'true');
});

test('language switches immediately, updates document language and persists across hydration', async () => {
  const user = userEvent.setup();
  // jsdom's zero-sized separators all sit at (0, 0); keep synthetic clicks outside their hit area.
  await user.pointer({ coords: { clientX: 500, clientY: 500 } });
  const view = render(
    <I18nProvider>
      <Shell />
    </I18nProvider>,
  );
  await user.click(
    within(screen.getByRole('radiogroup', { name: 'Language' })).getByRole('radio', { name: '中' }),
  );
  expect(screen.getByRole('button', { name: '打开脚本' })).toBeVisible();
  expect(document.documentElement.lang).toBe('zh-CN');
  const saved = localStorage.getItem(uiStorageKey)!;
  expect(JSON.parse(saved).state.language).toBe('zh');
  view.unmount();
  uiStore.setState({ language: 'en' });
  localStorage.setItem(uiStorageKey, saved);
  await act(async () => uiStore.persist.rehydrate());
  render(
    <I18nProvider>
      <Shell />
    </I18nProvider>,
  );
  expect(screen.getByRole('button', { name: '打开脚本' })).toBeVisible();
  const chinese = within(screen.getByRole('radiogroup', { name: '语言' })).getByRole('radio', {
    name: '中',
  });
  chinese.focus();
  await user.keyboard('{ArrowRight}');
  await user.keyboard(' ');
  expect(screen.getByRole('button', { name: 'Open script' })).toBeVisible();
});

test('dock tabs select empty results and issues without exposing an editor workflow', async () => {
  const user = userEvent.setup();
  // jsdom's zero-sized separators all sit at (0, 0); keep synthetic clicks outside their hit area.
  await user.pointer({ coords: { clientX: 500, clientY: 500 } });
  render(
    <I18nProvider>
      <Shell />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('tab', { name: /Issues/ }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('No issues');
  await user.click(screen.getByRole('tab', { name: 'Trades' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Run a backtest to see results here.');
});
