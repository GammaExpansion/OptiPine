import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { MarketBar, RunInput } from '@pine/engine';
import { isOptimizerError, type OptimizerMessageId } from '../src/text.ts';

const fixtures = new URL('../../golden/fixtures/', import.meta.url);

/** Split one CSV record, honouring quoted fields. */
function fields(line: string): string[] {
  const result: string[] = [];
  let field = '',
    quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      result.push(field);
      field = '';
    } else field += character;
  }
  result.push(field);
  return result;
}

/** OHLCV bars from a golden `data.csv`; plot columns are ignored. */
export function parseBars(csv: string): MarketBar[] {
  const [header, ...rows] = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const names = fields(header).map((name) => name.toLowerCase());
  const columns = (['time', 'open', 'high', 'low', 'close', 'volume'] as const).map((name) => {
    assert.equal(names.filter((item) => item === name).length, 1, `one ${name} column`);
    return names.indexOf(name);
  });
  return rows.map((row) => {
    const values = fields(row);
    const [time, open, high, low, close, volume] = columns.map((column) => Number(values[column]));
    return { time, open, high, low, close, volume };
  });
}

export interface StrategyFixture {
  source: string;
  bars: MarketBar[];
  meta: { syminfo: RunInput['syminfo']; timeframe: string; [key: string]: unknown };
}

/** Source, bars and recorded run context of one golden fixture, read without the harness. */
export async function strategyFixture(
  path = 'strategy/v6/B_orders_strings__none',
): Promise<StrategyFixture> {
  const directory = new URL(`${path}/`, fixtures);
  const [source, csv, meta] = await Promise.all(
    ['source.pine', 'data.csv', 'meta.json'].map((name) =>
      readFile(new URL(name, directory), 'utf8'),
    ),
  );
  return { source, bars: parseBars(csv), meta: JSON.parse(meta) };
}

/** An `assert.throws` validator for an error this package raised with `code` (and `values`). */
export function raises(code: OptimizerMessageId, values?: Record<string, unknown>) {
  return (error: unknown): true => {
    assert.ok(isOptimizerError(error, code), `expected ${code}, got ${String(error)}`);
    if (values)
      for (const [key, value] of Object.entries(values)) assert.deepEqual(error.values[key], value);
    return true;
  };
}
