import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { collectLicenseAssets } from './licenses.ts';

test('the installed production tree ships licenses, font texts and the upstream chart notice', () => {
  const assets = collectLicenseAssets();
  assert.deepEqual(assets, collectLicenseAssets());
  const notices = assets['licenses/THIRD_PARTY_NOTICES.txt'];
  for (const name of [
    'react',
    '@codemirror/view',
    '@radix-ui/react-dialog',
    'tslib',
    'fancy-canvas',
  ])
    assert.ok(notices.includes(`${name}@`), name);
  for (const name of ['vite', 'vitest', 'typescript', '@pine/golden', '@pine/engine'])
    assert.ok(!notices.includes(`${name}@`), name);
  for (const font of ['barlow', 'noto-sans-sc', 'source-code-pro']) {
    const original = readFileSync(
      new URL(`../../../node_modules/@fontsource/${font}/LICENSE`, import.meta.url),
      'utf8',
    );
    assert.ok(assets[`licenses/${font}.txt`].includes(original), font);
    assert.ok(notices.includes(original), font);
  }
  const notice = readFileSync(
    new URL('../licenses/lightweight-charts-NOTICE.txt', import.meta.url),
    'utf8',
  );
  assert.ok(assets['licenses/lightweight-charts.txt'].includes(notice));
  assert.ok(notices.includes(notice.trim()));
  assert.match(notices, /Copyright \(c\) Microsoft Corporation/);
  // The header's GitHub mark is a copied Octicons path, so its notice comes from a supplement.
  assert.ok(notices.includes('The GitHub mark is from GitHub Octicons'));
  assert.ok(
    notices.includes(
      readFileSync(new URL('../licenses/octicons-LICENSE.txt', import.meta.url), 'utf8').trim(),
    ),
  );
  assert.equal(
    assets['licenses/OptiPine.txt'],
    readFileSync(new URL('../../../LICENSE', import.meta.url), 'utf8'),
  );
});

test('walks nested versions and peers once, skips absent optional dependencies and ignores dev tools', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'optipine-licenses-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path: string, manifest: object, license?: string) => {
    const directory = join(root, path);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
    if (license) writeFileSync(join(directory, 'LICENSE'), license);
    return directory;
  };
  put('', { workspaces: ['apps/web'] });
  writeFileSync(join(root, 'LICENSE'), 'App license');
  const app = put('apps/web', {
    name: '@pine/web',
    version: '1',
    dependencies: { a: '1', b: '1' },
    devDependencies: { dev: '1' },
  });
  const a = put(
    'node_modules/a',
    {
      name: 'a',
      version: '1',
      license: 'MIT',
      dependencies: { b: '2' },
      peerDependencies: { peer: '*', optionalPeer: '*' },
      peerDependenciesMeta: { optionalPeer: { optional: true } },
      optionalDependencies: { absent: '*' },
    },
    'License A',
  );
  writeFileSync(join(a, 'NOTICE'), 'Notice A');
  put(
    'node_modules/b',
    { name: 'b', version: '1', license: 'MIT', dependencies: { a: '1' } },
    'License B1',
  );
  put('node_modules/a/node_modules/b', { name: 'b', version: '2', license: 'ISC' }, 'License B2');
  put('node_modules/peer', { name: 'peer', version: '1', license: 'MIT' }, 'Peer license');
  put('node_modules/dev', { name: 'dev', version: '1' });
  const text = collectLicenseAssets(app)['licenses/THIRD_PARTY_NOTICES.txt'];
  for (const license of ['License A', 'Notice A', 'License B1', 'License B2', 'Peer license'])
    assert.equal(text.split(license).length - 1, 1, license);
  assert.ok(!text.includes('dev@'));

  rmSync(join(a, 'LICENSE'));
  assert.throws(() => collectLicenseAssets(app), /Missing license text: a@1/);
  writeFileSync(join(a, 'LICENSE'), '');
  assert.throws(() => collectLicenseAssets(app), /Empty license: a/);
  writeFileSync(join(a, 'LICENSE'), 'License A');
  rmSync(join(root, 'node_modules/peer'), { recursive: true });
  assert.throws(() => collectLicenseAssets(app), /Missing production dependency: peer/);
});
