import type { propertiesEn } from './properties-en.ts';

/** Copy loaded with the properties area. */
export const propertiesZh = {
  'properties.shared': '回测与优化共用',
  'properties.back': '返回参数',
  'properties.backSettings': '返回设置',
  'properties.groupGeneral': '常规',
  'properties.groupExecution': '细分与执行',
  'properties.groupBroker': '经纪商模拟',
  'properties.currency': '货币',
  'properties.sameAsChart': '与图表相同',
  'properties.currencyNote': '目前仅支持图表货币。',
  'properties.pyramiding': '金字塔加仓（次）',
  'properties.barDetalization': 'Bar 细分',
  'properties.ticksPerBar': '每根 4 tick',
  'properties.detalizationNote': '目前仅支持默认细分。',
  'properties.overriddenValue': '已覆盖，脚本值为 {value}。',
  'properties.overriddenComputed': '已覆盖，脚本在第 {line} 行计算此值。',
  'properties.reset': '恢复',
  'properties.overriddenCount': '已覆盖 {count} 项',
  'properties.resetAll': '全部恢复为脚本值',
  'properties.leverageSuffix': 'x',
  'properties.tick': 'tick',
  'properties.ticks': 'tick',
} satisfies Record<keyof typeof propertiesEn, string>;
