# Drawnix Store BFF

Drawnix Store 使用 `apps/drawnixstore-api` 作为 Nitro Backend for Frontend。`apps/drawnixstore-web` 不直接访问 PocketBase，不构建 PocketBase 地址，不读取或保存 PocketBase JWT。

## 请求边界

- 浏览器只调用同源 `/api/*`，Nginx 将其反向代理到内部 `drawnixstore-api` 容器。
- 登录和注册由 BFF 调用 PocketBase；成功后把用户 JWT 写入 HttpOnly Cookie。
- BFF 读取 Cookie 后为每个请求创建独立 PocketBase 客户端并刷新用户身份。私有 Workspace 和 Canvas 操作继续受 PocketBase owner rule 约束。
- 普通用户请求不得使用 PocketBase 超级管理员身份。只有匿名 `/embed/:token.svg` 查询使用服务端受限的超级管理员客户端。
- `owner`、`workspace` 等归属字段由服务端推导或固定，浏览器不可在更新 Canvas 时重绑定归属关系。

## 会话与 CSRF

- `NITRO_WEB_ORIGIN` 是 BFF 写请求允许的唯一浏览器来源，必须配置为公开应用地址。
- `NITRO_SESSION_SECURE=true` 时使用 `__Host-drawnixstore-session`、`Secure`、`HttpOnly`、`SameSite=Lax` Cookie。仅本地 HTTP 开发可设为 `false`，此时使用不带 `__Host-` 前缀的 Cookie。
- 登录和注册有进程内基础限流。横向扩容前必须改用网关、边缘或 Redis 限流。

## 部署

生产 Compose 中 Web 与 API 通过私有网络通信，API 不发布宿主机端口。Web 公开入口代理 `/api/` 和 `/embed/`，并负责 SPA 回退。PocketBase 地址与超级管理员凭据只能通过 API 容器运行时环境注入。

本地开发通过 Vite 将 `/api` 与 `/embed` 代理至 `http://127.0.0.1:7400`。Nitro 使用默认 `NITRO_WEB_ORIGIN=http://localhost:7300`；若 Vite 使用其他 host 或端口，必须显式覆盖该变量。
