import type { MarketBar, RunInput } from '@pine/engine';

/** Six Float64 columns preserve numeric bar values without cloning thousands of objects. */
export interface PackedRunInput extends Omit<RunInput, 'bars'> {
  bars: Float64Array<ArrayBuffer>;
}

/** Structured-clone adapters can return typed arrays from another realm. */
export function isPackedInput(input: RunInput | PackedRunInput): input is PackedRunInput {
  return ArrayBuffer.isView(input.bars);
}

/** Capture caller-owned data synchronously; never detach a caller's buffer or retain its bars. */
export function snapshotInput(input: RunInput): PackedRunInput {
  const { bars, ...metadata } = input;
  const columns = new Float64Array(bars.length * 6);
  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index]!;
    columns[index] = bar.time;
    columns[bars.length + index] = bar.open;
    columns[bars.length * 2 + index] = bar.high;
    columns[bars.length * 3 + index] = bar.low;
    columns[bars.length * 4 + index] = bar.close;
    columns[bars.length * 5 + index] = bar.volume;
  }
  return { ...structuredClone(metadata), bars: columns };
}

/** Each Worker owns its transferred buffer; retain the snapshot for other Workers and replay. */
export function transferInput(input: PackedRunInput): PackedRunInput {
  return { ...input, bars: input.bars.slice() };
}

/** Expand once in the Worker; all trials in that Worker share these read-only market inputs. */
export function restoreInput(input: RunInput | PackedRunInput): RunInput {
  if (!isPackedInput(input)) return input;
  const columns = input.bars;
  const length = columns.length / 6;
  const bars: MarketBar[] = new Array(length);
  for (let index = 0; index < length; index++)
    bars[index] = {
      time: columns[index]!,
      open: columns[length + index]!,
      high: columns[length * 2 + index]!,
      low: columns[length * 3 + index]!,
      close: columns[length * 4 + index]!,
      volume: columns[length * 5 + index]!,
    };
  return { ...input, bars };
}
