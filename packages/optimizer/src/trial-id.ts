// Browsers and Node both provide TextEncoder; the build targets the ES library only.
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

function stableJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

/** Stable 128-bit FNV-1a identity, independent of key order, execution order, and workers. */
export function trialIdForParameters(parameters: unknown): string {
  const bytes = new TextEncoder().encode(stableJson(parameters));
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  for (const byte of bytes) {
    hash = BigInt.asUintN(128, (hash ^ BigInt(byte)) * 0x1000000000000000000013bn);
  }
  return hash.toString(16).padStart(32, '0');
}
