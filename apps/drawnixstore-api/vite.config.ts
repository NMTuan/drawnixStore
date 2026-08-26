/// <reference types="vitest" />
/** Drawnix Store API 的 Vitest 配置，解析共享业务领域包并在 Node 环境验证服务端边界。 */
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/drawnixstore-api',
  plugins: [nxViteTsPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.spec.ts'],
  },
});
