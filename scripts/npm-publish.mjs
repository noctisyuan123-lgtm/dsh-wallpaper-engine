#!/usr/bin/env node
// Assemble + publish the macOS fork as its own npm package
// (dsh-plugin-wallpaper-engine-mac), so market/npm users get updates
// directly from this fork instead of the upstream Windows package.
// The upstream package name (dsh-plugin-wallpaper-engine) stays untouched
// in this repo — the local DSH profile binds to it via link:.
// Usage: node scripts/npm-publish.mjs [--dry-run]
import { readFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const out = new URL('.npm/', import.meta.url).pathname;

rmSync(out, { recursive: true, force: true });
mkdirSync(out + 'lib', { recursive: true });
cpSync(root + 'lib', out + 'lib', { recursive: true });
for (const f of ['cordis.patch.yml', 'README.md', 'README.zh.md']) {
  cpSync(root + f, out + f);
}

// The tarball is published as the -mac fork, but the loader entry name and the
// browser bundle's module id still reference the upstream package name — DSH
// then fails to import the loader ("Cannot find package") and the bundle loads
// without registering. Rewrite both in staging so the whole package is
// self-consistent. READMEs get their title and install command pointed at the
// -mac package too; descriptive mentions of the upstream name are left as-is.
const REPO_NAME = 'dsh-plugin-wallpaper-engine';
const PUB_NAME = REPO_NAME + '-mac';
const rewrite = (file, f) => writeFileSync(out + file, f(readFileSync(out + file, 'utf8')));

rewrite('cordis.patch.yml', (s) => s.replaceAll(REPO_NAME, PUB_NAME));
rewrite('lib/client.js', (s) => s.replaceAll(REPO_NAME, PUB_NAME));
for (const f of ['README.md', 'README.zh.md']) {
  rewrite(f, (s) =>
    s
      .replace(new RegExp(`^# ${REPO_NAME}$`, 'm'), `# ${PUB_NAME}`)
      .replace(new RegExp(`(dsh plugin --profile \\w+ add )${REPO_NAME}(?!-)`, 'g'), `$1${PUB_NAME}`),
  );
}

const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
writeFileSync(out + 'package.json', JSON.stringify({
  name: 'dsh-plugin-wallpaper-engine-mac',
  version: pkg.version,
  description: 'macOS-enhanced fork of dsh-plugin-wallpaper-engine: WaifuX + loose-media support on top of the original Windows Wallpaper Engine implementation by elysia395.',
  type: 'module',
  main: 'lib/index.js',
  repository: { type: 'git', url: 'git+https://github.com/ruijiaang-lab/dsh-wallpaper-engine.git' },
  keywords: pkg.keywords,
  publishConfig: pkg.publishConfig,
  exports: pkg.exports,
  files: pkg.files,
  dsh: pkg.dsh,
  peerDependencies: pkg.peerDependencies,
  peerDependenciesMeta: pkg.peerDependenciesMeta,
  license: pkg.license,
}, null, 2) + '\n');

execSync(`npm publish ${out} ${process.argv.includes('--dry-run') ? '--dry-run' : ''}`, { stdio: 'inherit' });
