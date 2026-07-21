/// <reference types='vitest' />
/** Drawnix Store 浏览器应用的 Vite 与 Vitest 配置。 */
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/drawnixstore-web',
  server: {
    host: 'localhost',
    port: 7300,
    proxy: {
      // 本地 BFF 与分享链接保持 Web 同源，由 Vite 转发至独立 Nitro 服务。
      '/api': { target: 'http://127.0.0.1:7400', changeOrigin: true },
      '/embed': { target: 'http://127.0.0.1:7400', changeOrigin: true },
    },
  },
  preview: { host: 'localhost', port: 4300 },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../dist/apps/drawnixstore-web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
