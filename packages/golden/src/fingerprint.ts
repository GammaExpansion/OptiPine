import { readFile } from 'node:fs/promises';

/** The build records the comparison implementation shipped with this package. */
export async function readComparisonFingerprint(): Promise<string> {
  const asset = new URL('../dist/comparison-fingerprint.json', import.meta.url);
  let text: string;
  try {
    text = await readFile(asset, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error('Golden comparison fingerprint is missing; run npm run build first.');
    throw error;
  }
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('fingerprint' in value) ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint)
  )
    throw new Error('Invalid golden comparison fingerprint; rebuild the golden package.');
  return value.fingerprint;
}
