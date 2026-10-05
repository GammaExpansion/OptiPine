import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup } from '@testing-library/react';
import { getServices, replaceServices } from '../state/services.ts';
import { fakeServices } from '../state/test-support.ts';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { defaultPaneSizes, uiStorageKey, uiStore } from '../state/ui.ts';
import { Shell } from './Shell.tsx';
import { preloadChunks } from '../test/lazy-chunks.ts';
import { setViewportWidth } from '../test/viewport.ts';
import {
  loadOptimization,
  optimization,
  runOptimization,
} from '../pages/optimize/test-support.tsx';

preloadChunks('dialogs', 'optimize');
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

test.each([
  ['en', 'About & licenses', 'Source code on GitHub'],
  ['zh', '关于与许可证', 'GitHub 上的源代码'],
] as const)(
  'the header info button opens licenses and restores focus on close (%s)',
  async (language, label, repository) => {
    uiStore.setState({ language });
    const user = userEvent.setup();
    await user.pointer({ coords: { clientX: 500, clientY: 500 } });
    render(
      <I18nProvider>
        <Shell />
      </I18nProvider>,
    );
    const trigger = screen.getByRole('button', { name: label });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger.textContent).toBe('');
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(label);
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: label });
    expect(within(dialog).getByRole('link', { name: 'TradingView' })).toHaveAttribute(
      'href',
      'https://www.tradingview.com/',
    );
    expect(dialog).toHaveTextContent('Copyright (с) 2025 TradingView, Inc.');
    const source = within(dialog).getByRole('link', { name: repository });
    expect(source).toHaveAttribute('href', 'https://github.com/GammaExpansion/OptiPine');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(dialog).toHaveTextContent('GitHub Octicons');
    expect(dialog).toHaveTextContent('© 2025 GitHub Inc.');
    expect(dialog).toHaveTextContent('CodeMirror 6');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(uiStore.getState().openDialogs).toEqual([]);
  },
);

test.each([
  [1440, 'en', 'OptiPine on GitHub'],
  [1024, 'en', 'OptiPine on GitHub'],
  [390, 'zh', '在 GitHub 上查看 OptiPine'],
] as const)(
  'the header links the GitHub repository in a new tab at %i px (%s)',
  async (width, language, label) => {
    setViewportWidth(width);
    uiStore.setState({ language });
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Shell />
      </I18nProvider>,
    );
    const banner = screen.getByRole('banner');
    const link = within(banner).getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', 'https://github.com/GammaExpansion/OptiPine');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.textContent).toBe('');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await user.hover(link);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(label);
    // Beside About on a desktop and a tablet; beside the language switch on a phone, whose top
    // row a run's progress needs.
    const languages = within(banner).getByRole('radiogroup', { name: /Language|语言/ });
    const about = within(banner).getByRole('button', { name: /About|关于/ });
    if (width === 390) {
      expect(link.parentElement).toContainElement(languages);
      expect(link.parentElement).not.toContainElement(about);
    } else expect(link.parentElement).toBe(about.parentElement);
  },
);

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
  // The Backtest page never loads the optimization side; opening Optimize does.
  expect(getServices().optimization).toBeNull();
  screen.getByRole('button', { name: 'Optimize' }).focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  expect(getServices().optimization).not.toBeNull();
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
  expect(await within(screen.getByRole('tabpanel')).findByText('No issues')).toBeVisible();
  await user.click(screen.getByRole('tab', { name: 'Trades' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Run a backtest to see results here.');
});

test('Optimize opens with a script and data, and is marked once it holds results', async () => {
  const user = userEvent.setup();
  await user.pointer({ coords: { clientX: 500, clientY: 500 } });
  render(
    <I18nProvider>
      <Shell />
    </I18nProvider>,
  );
  const optimize = () => screen.getByRole('button', { name: 'Optimize' });
  expect(optimize()).toBeDisabled();
  await loadOptimization();
  expect(optimize()).toBeEnabled();
  await user.click(optimize());
  expect(await screen.findByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  const marked = () => optimize().querySelector('[aria-hidden="true"]');
  expect(marked()).toBeNull();
  // A first run has no results yet (O8).
  let run!: Promise<void>;
  act(() => {
    run = optimization().actions.start();
  });
  expect(marked()).toBeNull();
  await act(() => run);
  expect(marked()).not.toBeNull();
  // Outdated results stay marked (R5), and so do they during the next run.
  act(() => optimization().actions.setRange('Length', { to: 5 }));
  expect(marked()).not.toBeNull();
  act(() => void optimization().actions.start());
  expect(marked()).not.toBeNull();
  act(() => optimization().actions.cancel());
  expect(marked()).not.toBeNull();
});
