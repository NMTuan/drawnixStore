/// <reference types='vitest' />
/** tlStore 领域包的 Vitest 配置，仅运行纯函数与保存队列测试。 */
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
