#!/usr/bin/env node
/**
 * Build unpacked extension development directories for Chrome and Firefox.
 *
 * Usage:
 *   node scripts/build-unpacked.mjs --target=chrome
 *   node scripts/build-unpacked.mjs --target=firefox
 *   node scripts/build-unpacked.mjs --target=all
 *
 * Or via npm:
 *   npm run build:chrome
 *   npm run build:firefox
 *   npm run build:all
 *
 * Copies current source trees from `src/chrome` and `src/firefox` to
 * `dist/unpacked/chrome` and `dist/unpacked/firefox` respectively.
 */

import { readFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const targetMap = {
  chrome: { packageName: 'chrome', sourceDir: 'chrome' },
  edge: { packageName: 'edge', sourceDir: 'chrome' },
  firefox: { packageName: 'firefox', sourceDir: 'firefox' },
};

function parseTargetArg() {
  const arg = process.argv.find((a) => a.startsWith('--target='));
  if (arg) {
    const val = arg.split('=')[1]?.toLowerCase();
    if (val === 'all') return ['chrome', 'firefox'];
    if (targetMap[val]) return [val];
  }
  const pos = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (pos === 'all') return ['chrome', 'firefox'];
  if (pos && targetMap[pos]) return [pos];

  return ['chrome', 'firefox'];
}

function run() {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;

  const targets = parseTargetArg();
  const distUnpackedDir = path.join(root, 'dist', 'unpacked');

  console.log(`Building unpacked extension outputs (v${version}) …`);

  for (const targetKey of targets) {
    const target = targetMap[targetKey];
    if (!target) continue;

    const srcDir = path.join(root, 'src', target.sourceDir);
    const manifestPath = path.join(srcDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Source manifest missing at ${manifestPath}`);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== version) {
      console.warn(`Warning: manifest version (${manifest.version}) does not match package.json version (${version}) for ${targetKey}`);
    }

    const outDir = path.join(distUnpackedDir, target.packageName);
    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }
    mkdirSync(outDir, { recursive: true });

    cpSync(srcDir, outDir, { recursive: true });

    console.log(`  ✓ Unpacked build created at: dist/unpacked/${target.packageName}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error(`build-unpacked: ${error.message}`);
    process.exit(1);
  }
}
