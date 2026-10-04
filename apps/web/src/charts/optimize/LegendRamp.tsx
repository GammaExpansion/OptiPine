import type { Heatmap } from '@pine/optimizer';
import { formatNumber } from '../../i18n/translate.ts';
import { heatTokens, legendScale, neutralStep } from './geometry.ts';

/** An end of the ramp, short but never rounded to nothing: 2.4K, 272, 0.0315. */
export function legendValue(value: number): string {
  return Math.abs(value) >= 1000
    ? formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 })
    : formatNumber(value, { maximumSignificantDigits: 3 });
}

/**
 * A parameter map's colour ramp between its worst and best values, with the break-even under the
 * neutral step where losing and winning cells meet (R4, W3). `missing` stands for an end without a
 * value.
 */
export function LegendRamp({
  map,
  className,
  missing,
}: {
  map: Heatmap;
  className: string;
  missing: string;
}) {
  const scale = legendScale(map);
  const end = (value: number | null) => (value === null ? missing : legendValue(value));
  return (
    <>
      <span>{end(scale.worst)}</span>
      <div className={className}>
        {scale.steps.map((step) => (
          <i key={step} style={{ background: `var(${heatTokens[step]})` }}>
            {step === neutralStep && scale.breakEven !== null && (
              <span>{formatNumber(scale.breakEven)}</span>
            )}
          </i>
        ))}
      </div>
      <span>{end(scale.best)}</span>
    </>
  );
}
