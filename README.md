# Drawnix Store

Drawnix Store 是一个私有 Canvas 工作台，提供账户登录、工作区、画布保存、归档和只读 SVG 分享能力。浏览器只通过同源 BFF 访问业务数据，PocketBase 保持在内部网络中。

## 上游来源

本仓库 fork 自 [plait-board/drawnix](https://github.com/plait-board/drawnix)，保留 Drawnix 和 Plait 的画布能力作为上游依赖。

Drawnix Store 的业务代码位于独立的 `apps/drawnixstore-*` 和 `packages/drawnixstore-*` 目录。业务应用仅使用 `@drawnix/drawnix` 的公开导出、Props 和回调，不修改或依赖上游核心包的内部实现。同步上游前后应构建并验证 Drawnix Store 的公开 API 兼容性。

## 架构

```text
Browser
  |
  v
drawnixstore-web (Nginx, :80)
  |-- /api, /embed --> drawnixstore-api (Nitro, :7400)
                              |
                              v
                        PocketBase (:8090, private network)

drawnixstore-bootstrap -- one-shot --> PocketBase collections
```

- `drawnixstore-web`：React 和 Drawnix 编辑器，静态文件由 Nginx 提供，并代理同源 API。
- `drawnixstore-api`：Nitro BFF，负责认证、权限校验、Canvas 数据和公开 SVG。
- `drawnixstore-bootstrap`：一次性初始化 PocketBase 集合及访问规则。
- `PocketBase`：保存用户、工作区和 Canvas；不直接暴露给浏览器。

## 容器部署

GitHub Actions 会发布 Web、API、Bootstrap 三个多架构镜像到 GHCR。部署主机不需要仓库源码、Node.js 或本地构建环境。

1. 下载 [compose.yml](apps/drawnixstore-deployment/compose.yml) 和 [.env.example](apps/drawnixstore-deployment/.env.example) 到部署目录。
2. 将 `.env.example` 改名为 `.env.local`，填写管理员凭据、32 字节 `POCKETBASE_ENCRYPTION`、公开 HTTPS 地址和镜像标签。
3. 拉取并启动服务：

```bash
docker compose --env-file .env.local -f compose.yml pull
docker compose --env-file .env.local -f compose.yml up -d
```

默认镜像前缀为 `ghcr.io/nmtuan/drawnixstore`。部署 fork 或私有 GHCR 包时，通过 `DRAWNIX_STORE_IMAGE_REPOSITORY` 覆盖；私有包需先执行 `docker login ghcr.io`。

生产环境必须使用同一次 GitHub Actions 发布产生的 `sha-<短提交>` 作为 `DRAWNIX_STORE_IMAGE_TAG`，使 Web、API、Bootstrap 保持同一版本。`latest` 仅用于测试。

Web 默认监听 `7300`，生产环境应由外部 HTTPS 反向代理将 `DRAWNIX_STORE_PUBLIC_ORIGIN` 的流量转发至该端口。HTTPS 环境须保持 `NITRO_SESSION_SECURE=true`，否则浏览器不会安全地处理会话 Cookie。

部署检查、数据卷和 PocketBase 升级边界见 [apps/drawnixstore-deployment/readme.md](apps/drawnixstore-deployment/readme.md)。

## 本地开发

前置条件：Node.js 版本与 `.nvmrc` 一致，并有可访问的 PocketBase 实例。

```bash
npm ci
npm run start:drawnixstore-api
npx nx serve drawnixstore-web
```

API 默认运行于 `http://localhost:7400`，Web 默认运行于 `http://localhost:7300`。在仓库根目录创建未跟踪的 `.env.local`，并参考 `apps/drawnixstore-api/.env.example` 填写本地 PocketBase 配置；首次初始化集合可执行：

```bash
npm run bootstrap:drawnixstore
```

## 自动化发布

唯一的 GitHub Actions 工作流为 [drawnix-store-images.yml](.github/workflows/drawnix-store-images.yml)。它在 `develop`、`main`、`master`、`v*` tag 或手动触发时，构建并发布 Drawnix Store 的三个运行镜像。

## 许可证

本仓库沿用 [MIT License](LICENSE)。Drawnix 和 Plait 的相关版权及许可证以各自上游仓库为准。
