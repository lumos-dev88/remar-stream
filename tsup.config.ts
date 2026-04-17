import { defineConfig } from 'tsup';
import { sassPlugin } from 'esbuild-sass-plugin';

export default defineConfig([
  // Main library entry
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom', 'uuid', 'crypto', 'mermaid'],
    esbuildPlugins: [sassPlugin()],
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";\nimport "./index.css";',
      };
      options.loader = {
        ...options.loader,
        '.woff': 'file',
        '.woff2': 'file',
        '.eot': 'file',
        '.ttf': 'file',
        '.svg': 'file',
      };
    },
  },
  // Shiki Web Worker (separate bundle, no React/DOM dependencies)
  {
    entry: ['src/extensions/codeblock/shiki-worker.ts'],
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    external: [],
    outDir: 'dist',
    outExtension() {
      return { js: '.worker.js' };
    },
    esbuildOptions(options) {
      // Worker entry: no "use client" banner
      options.banner = {};
    },
  },
]);
