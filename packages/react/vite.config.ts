import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: 'react',
      jsxRuntime: 'classic',
    }),
    dts({
      outDir: resolve(__dirname, 'lib', 'types'),
      insertTypesEntry: true,
    }),
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    outDir: resolve(__dirname, 'lib'),
    minify: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src', 'index.ts'),
      name: 'tinyIntl',
      // the proper extensions will be added
      fileName: 'index',
      formats: ['es', 'cjs', 'umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-jsx-runtime'],
      output: {
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'react-jsx-runtime': 'React',
        },
      },
    },
  },
  esbuild: {
    jsxInject: `import * as React from 'react'`,
  },
});
