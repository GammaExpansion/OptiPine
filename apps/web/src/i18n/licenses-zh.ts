import type { licensesEn } from './licenses-en.ts';

export const licensesZh = {
  'licenses.title': '关于与许可证',
  'licenses.description': 'OptiPine 及其所使用的开源软件。',
  'licenses.app': 'OptiPine · MIT 许可证',
  'licenses.copyright': 'Copyright (c) 2026 GammaExpansion',
  'licenses.appLicense': '阅读 MIT 许可证',
  'licenses.charts': 'TradingView Lightweight Charts™',
  'licenses.chartNotice': 'Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/',
  'licenses.chartLicense': 'Apache 许可证 2.0',
  'licenses.tradingView': 'TradingView',
  'licenses.tslib': '包含 tslib 的部分代码，© Microsoft Corporation，依据 BSD 零条款许可证授权。',
  'licenses.fonts': '字体 · SIL 开放字体许可证 1.1',
  'licenses.fontsource': '字体通过 Fontsource 获取并由本站提供。各链接均包含完整的字体许可证。',
  'licenses.barlow': 'Barlow',
  'licenses.barlowCredit': '2017 The Barlow Project Authors',
  'licenses.noto': 'Noto Sans SC',
  'licenses.notoCredit': 'Google LLC 和 Adobe（Noto CJK）',
  'licenses.source': 'Source Code Pro',
  'licenses.sourceCredit': 'Adobe，保留字体名称 Source',
  'licenses.libraries': '软件库',
  'licenses.mitLibraries':
    'React 和 React DOM、Radix UI 组件、TanStack Table 和 TanStack Virtual、CodeMirror 6 和 Lezer、Zustand、react-resizable-panels 及其依赖项。',
  'licenses.libraryLicenses':
    '这些软件库依据 MIT 许可证授权。完整的第三方声明列明了各项生产依赖的版本、版权及许可证全文。',
  'licenses.notices': '阅读完整第三方声明',
  'licenses.independent':
    'TradingView 和 Pine Script 是 TradingView, Inc. 的商标。Binance 和 Yahoo 是各自所有者的商标。OptiPine 为独立项目，与上述机构无关联，亦未获其认可。',
} satisfies Record<keyof typeof licensesEn, string>;
