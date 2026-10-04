import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licensesEn } from '../src/i18n/licenses-en.ts';

interface Manifest {
  name: string;
  version: string;
  license?: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const supplementalRoot = fileURLToPath(new URL('../licenses/', import.meta.url));
// These npm releases omit their license/notice files. Provenance is in licenses/README.md.
// A changed version must supply its own text or receive a reviewed supplement.
const supplements: Record<string, string> = {
  'fancy-canvas@2.1.0': 'fancy-canvas-LICENSE.txt',
  'react-remove-scroll-bar@2.3.8': 'react-remove-scroll-bar-LICENSE.txt',
};

const manifestAt = (directory: string): Manifest =>
  JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest;

/** Resolve from the importing package, including nested versions and workspace symlinks. */
function dependencyDirectory(name: string, from: string): string | undefined {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(directory) === directory) return undefined;
  }
}

/**
 * Ship the installed web production dependency closure, including installed optional peers.
 * Never traverse devDependencies or fetch license text during a build. A missing required
 * package, license or reviewed chart notice fails the build instead of silently omitting it.
 */
export function collectLicenseAssets(appDirectory = webRoot): Record<string, string> {
  const projectRoot = resolve(appDirectory, '../..');
  const appLicense = readFileSync(join(projectRoot, 'LICENSE'), 'utf8');
  const workspaces = new Set(
    (manifestAt(projectRoot).workspaces ?? []).map((path) => realpathSync(join(projectRoot, path))),
  );
  const seen = new Set<string>();
  const packages: { name: string; version: string; text: string }[] = [];
  const assets: Record<string, string> = { 'licenses/OptiPine.txt': appLicense };

  function visit(directory: string): void {
    directory = realpathSync(directory);
    if (seen.has(directory)) return;
    seen.add(directory);
    const manifest = manifestAt(directory);
    if (!workspaces.has(directory)) {
      if (!manifest.license) throw new Error(`Missing license identifier: ${manifest.name}`);
      const files = readdirSync(directory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() && /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(entry.name),
        )
        .map((entry) => entry.name)
        .sort();
      const texts = files.map((name) => readFileSync(join(directory, name), 'utf8'));
      if (!files.some((name) => /^(licen[cs]e|copying)([._-]|$)/i.test(name))) {
        const supplement = supplements[`${manifest.name}@${manifest.version}`];
        if (!supplement)
          throw new Error(`Missing license text: ${manifest.name}@${manifest.version}`);
        texts.unshift(readFileSync(join(supplementalRoot, supplement), 'utf8'));
      }
      if (texts.some((text) => !text.trim())) throw new Error(`Empty license: ${manifest.name}`);
      if (manifest.name === 'lightweight-charts') {
        if (!files.some((name) => /^notice([._-]|$)/i.test(name))) {
          if (manifest.version !== '5.2.1')
            throw new Error(`Review the Lightweight Charts notice for ${manifest.version}`);
          texts.unshift(
            readFileSync(join(supplementalRoot, 'lightweight-charts-NOTICE.txt'), 'utf8'),
          );
        }
      }
      const text = `${manifest.name}@${manifest.version}\nLicense: ${manifest.license}\n\n${texts.join('\n\n')}`;
      packages.push({ name: manifest.name, version: manifest.version, text });
      if (manifest.name.startsWith('@fontsource/'))
        assets[`licenses/${manifest.name.slice('@fontsource/'.length)}.txt`] = text;
      if (manifest.name === 'lightweight-charts') assets['licenses/lightweight-charts.txt'] = text;
    }
    const dependencies = {
      ...manifest.peerDependencies,
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    };
    for (const name of Object.keys(dependencies).sort()) {
      const child = dependencyDirectory(name, directory);
      if (child) visit(child);
      else if (
        !Object.hasOwn(manifest.optionalDependencies ?? {}, name) &&
        (Object.hasOwn(manifest.dependencies ?? {}, name) ||
          !manifest.peerDependenciesMeta?.[name]?.optional)
      )
        throw new Error(`Missing production dependency: ${name} (from ${manifest.name})`);
    }
  }
  visit(appDirectory);
  packages.sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
  );
  assets['licenses/THIRD_PARTY_NOTICES.txt'] = [
    'OptiPine — third-party notices',
    `${licensesEn['licenses.charts']}\n${licensesEn['licenses.chartNotice']}`,
    licensesEn['licenses.tslib'],
    `${licensesEn['licenses.fonts']}\n${licensesEn['licenses.barlow']}: ${licensesEn['licenses.barlowCredit']}\n${licensesEn['licenses.noto']}: ${licensesEn['licenses.notoCredit']}\n${licensesEn['licenses.source']}: ${licensesEn['licenses.sourceCredit']}`,
    licensesEn['licenses.independent'],
    'Installed production dependencies (including transitive dependencies and installed peers):\n' +
      packages.map(({ name, version }) => `${name}@${version}`).join('\n'),
    `${licensesEn['licenses.app']}\n\n${appLicense}`,
    ...packages.map(({ text }) => text),
  ].join('\n\n' + '='.repeat(72) + '\n\n');
  return assets;
}
