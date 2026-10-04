import type { licensesEn } from './licenses-en.ts';

export const licensesZh = {
  title: '关于与许可证',
  description: 'OptiPine 及其所使用的开源软件。',
  app: 'OptiPine · MIT 许可证',
  copyright: 'Copyright (c) 2026 GammaExpansion',
  appLicense: '阅读 MIT 许可证',
  charts: 'TradingView Lightweight Charts™',
  chartNotice: 'Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/',
  chartLicense: 'Apache 许可证 2.0',
  tradingView: 'TradingView',
  tslib: '包含 tslib 的部分代码，© Microsoft Corporation，依据 BSD 零条款许可证授权。',
  fonts: '字体 · SIL 开放字体许可证 1.1',
  fontsource: '字体通过 Fontsource 获取并由本站提供。各链接均包含完整的字体许可证。',
  barlow: 'Barlow',
  barlowCredit: '2017 The Barlow Project Authors',
  noto: 'Noto Sans SC',
  notoCredit: 'Google LLC 和 Adobe（Noto CJK）',
  source: 'Source Code Pro',
  sourceCredit: 'Adobe，保留字体名称 Source',
  libraries: '软件库',
  mitLibraries:
    'React 和 React DOM、Radix UI 组件、TanStack Table 和 TanStack Virtual、CodeMirror 6 和 Lezer、Zustand、react-resizable-panels 及其依赖项。',
  libraryLicenses:
    '这些软件库依据 MIT 许可证授权。完整的第三方声明列明了各项生产依赖的版本、版权及许可证全文。',
  notices: '阅读完整第三方声明',
  independent:
    'TradingView 和 Pine Script 是 TradingView, Inc. 的商标。Binance 和 Yahoo 是各自所有者的商标。OptiPine 为独立项目，与上述机构无关联，亦未获其认可。',
} satisfies Record<keyof typeof licensesEn, string>;
