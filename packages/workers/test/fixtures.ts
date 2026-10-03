import assert from 'node:assert/strict';
import type { MarketBar } from '@pine/engine';

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
