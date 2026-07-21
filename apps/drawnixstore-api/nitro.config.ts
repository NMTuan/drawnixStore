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
    // 私有部署默认关闭公开注册；首个账号只能经由受服务端令牌保护的初始化端点创建。
    registrationEnabled: false,
    // 初始化令牌仅保存在服务端环境变量，绝不暴露给 Vite 或浏览器构建产物。
    setupToken: '',
  },
});
