/** Drawnix Store SVG API 的 Nitro 配置，所有 PocketBase 凭据仅在服务端运行时读取。 */
import { defineConfig } from 'nitro';

export default defineConfig({
  rootDir: __dirname,
  serverDir: './server',
  // 与 drawnixstore-web 的 Vite 开发代理保持一致；生产环境由 NITRO_PORT 覆盖。
  devServer: { port: 7400 },
  output: { dir: '../../dist/apps/drawnixstore-api' },
  runtimeConfig: {
    pocketbaseInternalUrl: '',
    pocketbaseSuperuserEmail: '',
    pocketbaseSuperuserPassword: '',
    // BFF 写请求只接受的固定浏览器来源，禁止从 Host 请求头推导可信来源。
    webOrigin: 'http://localhost:7300',
    // 生产必须为 true，开发 HTTP 环境显式使用 false 以避免浏览器拒绝 __Host- Cookie。
    sessionSecure: false,
  },
});
