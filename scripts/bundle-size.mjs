/**
 * Measures each package's published ESM entry the way bundlejs does —
 * esbuild bundle + minify + treeshake with the framework externalised, then
 * gzip -9 — and fails if any package exceeds its committed budget.
 *
 * Budgets live in scripts/size-budget.json. Growing a package is allowed, but
 * it has to be a deliberate, reviewable edit to that file.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { build } from 'esbuild';

const budgets = JSON.parse(readFileSync(new URL('./size-budget.json', import.meta.url), 'utf8'));

const TARGETS = [
  { name: '@tiny-intl/core', entry: 'packages/core/lib/esm/index.js', external: [] },
  {
    name: '@tiny-intl/react',
    entry: 'packages/react/lib/index.js',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  {
    name: '@tiny-intl/preact',
    entry: 'packages/preact/lib/index.js',
    external: ['preact', 'preact/compat', 'preact/jsx-runtime'],
  },
];

let failed = false;

for (const target of TARGETS) {
  const result = await build({
    entryPoints: [target.entry],
    bundle: true,
    minify: true,
    format: 'esm',
    treeShaking: true,
    external: target.external,
    write: false,
    legalComments: 'none',
  });
  const size = gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
  const budget = budgets[target.name];

  if (budget === undefined) {
    console.error(`✗ ${target.name}: no budget in scripts/size-budget.json`);
    failed = true;
  } else {
    const delta = budget - size;
    const mark = size > budget ? '✗' : '✓';
    console.log(
      `${mark} ${target.name.padEnd(20)} ${String(size).padStart(5)} B ` +
        `(budget ${budget} B, ${delta >= 0 ? `${delta} B headroom` : `${-delta} B OVER`})`,
    );
    if (size > budget) failed = true;
  }
}

if (failed) {
  console.error(
    '\nBundle size budget exceeded. Either shrink the change, or raise the ' +
      'budget in scripts/size-budget.json in this same commit and say why.',
  );
  process.exit(1);
}
