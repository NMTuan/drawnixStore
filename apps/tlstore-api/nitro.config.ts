/** tlStore SVG API 的 Nitro 配置，所有 PocketBase 凭据仅在服务端运行时读取。 */
import { defineConfig } from 'nitro';

export default defineConfig({
  rootDir: __dirname,
  serverDir: './server',
  // 与 tlstore-web 的 Vite 开发代理保持一致；生产环境由 NITRO_PORT 覆盖。
  devServer: { port: 7400 },
  output: { dir: '../../dist/apps/tlstore-api' },
  runtimeConfig: {
    pocketbaseInternalUrl: '',
    pocketbaseSuperuserEmail: '',
    pocketbaseSuperuserPassword: '',
  },
});
