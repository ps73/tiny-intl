import type { Format } from 'tsup';

import { writeFileSync } from 'fs';
import path from 'path';

import { defineConfig } from 'tsup';

const baseOutDir = 'lib';

const format: Format = (process.env.FORMAT as 'cjs' | 'esm') || 'cjs';

const addPackageJson = () => {
  const dir = path.resolve(baseOutDir);
  writeFileSync(
    path.resolve(dir, format, 'package.json'),
    JSON.stringify({
      type: format === 'cjs' ? 'commonjs' : 'module',
    }),
  );
};

export default defineConfig({
  entry: ['src'],
  target: 'es2022',
  format,
  minifyIdentifiers: false,
  bundle: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  outDir: format === 'cjs' ? `${baseOutDir}/cjs` : `${baseOutDir}/esm`,
  minify: false,
  minifySyntax: true,
  minifyWhitespace: false,
  config: format === 'cjs' ? 'tsconfig.cjs.json' : 'tsconfig.json',
  onSuccess: () => {
    addPackageJson();
    return new Promise((res) => {
      res();
    });
  },
  outExtension: () => ({
    js: '.js',
  }),
});
