import { resolve } from 'path';

import preact from '@preact/preset-vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    preact(),
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
});
