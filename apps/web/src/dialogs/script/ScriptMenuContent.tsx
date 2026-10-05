import { useState } from 'react';
import { DropdownMenu, type MenuEntry } from '../../components/DropdownMenu.tsx';
import { Icon } from '../../components/Icon.tsx';
import { examples } from '../../../examples/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { confirmReplace, downloadScript, pickScriptFile, showPaste } from './actions.ts';
import { ScriptButton, scriptName } from './ScriptButton.tsx';

/**
 * The script menu (S2) with its trigger. It replaces the header's plain script button when that
 * is first activated, so it starts open.
 */
export function ScriptMenuContent() {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const fileName = useBacktestStore((state) => state.fileName);
  const compile = useBacktestStore((state) => state.compile);
  const source = useBacktestStore((state) => state.source);
  const origin = useBacktestStore((state) => state.origin);
  const loadExample = useBacktestStore((state) => state.actions.loadExample);
  const entries: MenuEntry[] = [
    { id: 'name', type: 'heading', label: scriptName(t, fileName, source) },
    {
      id: 'facts',
      type: 'heading',
      label:
        compile.status === 'compiled'
          ? t('script.facts', {
              version: compile.description.version ?? 6,
              inputs: t('script.inputs', { count: compile.description.inputs.length }),
              plots: t('script.plots', { count: compile.description.plots.length }),
              duration: Math.round(compile.durationMs),
            })
          : t(`script.${compile.status}`),
    },
    { id: 'separator', type: 'separator' },
    {
      id: 'open',
      label: t('script.openFile'),
      icon: <Icon name="file" />,
      detail: t('script.shortcut'),
      onSelect: pickScriptFile,
    },
    {
      id: 'paste',
      label: t('script.pasteReplace'),
      icon: <Icon name="paste" />,
      onSelect: () => void showPaste(true),
    },
    {
      id: 'download',
      label: t('script.download'),
      icon: <Icon name="download" />,
      disabled: !source,
      onSelect: () => downloadScript(t('script.defaultFileName')),
    },
    { id: 'examples-separator', type: 'separator' },
    { id: 'examples', type: 'heading', label: t('script.examples') },
    ...examples.map((example) => ({
      id: example.id,
      label: example.title,
      icon:
        origin?.kind === 'example' && origin.id === example.id ? <Icon name="check" /> : undefined,
      onSelect: () => confirmReplace(() => void loadExample(example.id)),
    })),
  ];
  return (
    <DropdownMenu
      label={t('script.menu')}
      open={open}
      onOpenChange={setOpen}
      trigger={<ScriptButton />}
      entries={entries}
    />
  );
}
