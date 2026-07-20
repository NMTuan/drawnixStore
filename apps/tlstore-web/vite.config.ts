/// <reference types='vitest' />
/** tlStore 浏览器应用的 Vite 与 Vitest 配置。 */
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/tlstore-web',
  server: { host: 'localhost', port: 7300 },
  preview: { host: 'localhost', port: 4300 },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../dist/apps/tlstore-web',
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
