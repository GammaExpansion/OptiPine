import type { scriptEn } from './script-en.ts';

/** Copy loaded with the script area. */
export const scriptZh = {
  'script.menu': '脚本菜单',
  'script.pasteReplace': '从剪贴板粘贴并替换',
  'script.download': '下载 .pine',
  'script.shortcut': 'Ctrl O',
  'script.examples': '示例策略',
  'script.facts': 'Pine v{version}，{inputs}，{plots}，编译 {duration} ms',
  'script.inputs': '{count} 个输入',
  'script.inputs.one': '{count} 个输入',
  'script.plots': '{count} 条 plot',
  'script.plots.one': '{count} 条 plot',
  'script.fileError': '无法打开文件。请选择可读取的 .pine 文件。',
  'script.pasteTitle': '粘贴 Pine 代码',
  'script.pasteHint': '粘贴 Pine Script v5 或 v6 策略。',
  'script.pastePlaceholder': '在此粘贴代码',
  'script.clipboardError': '无法读取剪贴板。请使用 Ctrl + V 在此粘贴代码。',
  'script.source': 'Pine 源码',
  'script.replaceTitle': '替换当前脚本？',
  'script.replaceEdited': '{name} 自打开以来的修改将丢失。',
  'script.downloadReminder': '如需保留当前源码，请先下载 .pine 文件。',
  'script.replace': '替换脚本',
  'script.useCode': '使用此代码',
} satisfies Record<keyof typeof scriptEn, string>;
