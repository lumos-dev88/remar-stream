import { defineConfig } from 'tsup';
import { sassPlugin } from 'esbuild-sass-plugin';

export default defineConfig({
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
      // ⚠️ CSS 自动引入：esbuild 会将 SCSS 编译为 dist/index.css 但不在 JS 中保留 import。
      // 通过 banner 注入静态 import 语句，使用方的 Vite/Webpack 会在构建时自动解析。
      // 注意：此路径相对于 dist/index.js，且 esbuild 不验证路径是否存在。
      // 稳定前提：单 entry + 固定 dist/ 输出 + 不开 hash。
      // 如修改构建配置导致 CSS 输出路径变化，必须同步更新此字符串。
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
});
