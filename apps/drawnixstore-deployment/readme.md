# Drawnix Store 部署

此编排运行浏览器应用、Nitro BFF、PocketBase、超级管理员初始化和一次性 Schema bootstrap。浏览器只请求 Web 同源的 `/api` 与 `/embed`。

将 `compose.yml` 和 `.env.example` 复制到任意部署目录，再将 `.env.example` 填写为 `.env`。Docker Compose 会自动读取同目录 `.env` 文件；若命名为 `.env.local`，每个命令都必须传入 `--env-file .env.local`。部署主机不需要仓库源码或 Node 工具链，只需拉取已发布镜像并启动：

```bash
docker compose -f compose.yml pull
docker compose -f compose.yml up -d
```

默认镜像来自 `ghcr.io/nmtuan/drawnixstore`。生产部署应使用 GitHub Actions 成功发布后的 `sha-<短提交>` 不可变 `DRAWNIX_STORE_IMAGE_TAG`，确保 Web、API 与 bootstrap 来自同一提交；`latest` 仅适合测试。需要从 fork 或私有镜像仓库部署时覆盖 `DRAWNIX_STORE_IMAGE_REPOSITORY`。私有 GHCR 包需要先执行 `docker login ghcr.io`，或将包在 GitHub Packages 中设为公开。

Web 默认绑定 `0.0.0.0`。生产环境必须由外部 HTTPS 反向代理提供 `DRAWNIX_STORE_PUBLIC_ORIGIN` 所对应的 TLS 入口，再将流量转发到 `DRAWNIX_STORE_WEB_PORT`。`DRAWNIX_STORE_PUBLIC_ORIGIN` 必须与浏览器实际访问的完整协议、主机和端口一致。

仅限受控的局域网 HTTP 调试，可将 `DRAWNIX_STORE_PUBLIC_ORIGIN` 设置为完整的 `http://主机地址:端口`。此模式不适用于公网或生产部署。

会话 Cookie 配置取决于镜像版本：

- `v0.2.0`：`NITRO_SESSION_SECURE` 显式控制 Cookie 是否带 `Secure` 属性。HTTPS 入口必须设为 `true`；HTTP 调试入口必须设为 `false`。若 HTTP 入口错误设为 `true`，浏览器会拒绝 `Secure` Cookie，注册或登录虽会成功，但后续 `/api/workspaces` 会因未携带会话 Cookie 返回 `401`。
- `v0.2.0` 之后的镜像：不再使用 `NITRO_SESSION_SECURE`，BFF 根据 `DRAWNIX_STORE_PUBLIC_ORIGIN` 自动判断。HTTPS 使用 `Secure` Cookie，HTTP 使用普通 HttpOnly Cookie。

修改会话 Cookie 配置后，先重建 API 容器，再清除浏览器中该公开地址的站点 Cookie 并重新登录：

```bash
docker compose -f compose.yml up -d --force-recreate drawnixstore-api
```

若使用 `.env.local`，在上述命令的 `docker compose` 后加入 `--env-file .env.local`。

## 私有账户初始化

`DRAWNIX_STORE_REGISTRATION_ENABLED` 默认是 `false`，普通 `/api/auth/register` 会返回 `403`，登录页面也不会显示注册入口。首次部署须设置 `DRAWNIX_STORE_SETUP_TOKEN`，建议使用 `openssl rand -hex 32` 生成至少 32 字节的安全随机值。

当系统尚无用户、普通注册关闭且令牌已配置时，访问站点会进入 `/setup`。在该页面输入邮箱、密码与初始化令牌即可创建唯一首账号并自动登录。首账号创建后，初始化端点立即失效；令牌不会由 API 返回或被浏览器持久化、不写入日志，也不会注入 Web 或 bootstrap 容器。

请勿将初始化令牌放入 URL、截图、浏览器书签或版本库。丢失令牌但尚未创建用户时，可在部署环境中替换 `DRAWNIX_STORE_SETUP_TOKEN` 后重建 API 容器。已有用户时修改该值不影响登录，也不会重新开放初始化入口。

需要支持多用户自助注册时，显式设置 `DRAWNIX_STORE_REGISTRATION_ENABLED=true` 并重建 API 容器；该模式下 `/setup` 不可用。切回 `false` 会保留现有用户，仅关闭后续普通注册。

`POCKETBASE_ENCRYPTION` 必须是安全随机的 32 字节值。示例中的值仅用于通过长度校验，部署前必须替换；更换现有生产数据卷的加密值会使旧数据不可读。

PocketBase 当前固定为已验证的 `0.39.8`。升级镜像前必须在独立数据卷上检查 `pocketbase-init`、`drawnixstore-bootstrap`、`pocketbase` 健康状态，并验证注册登录、Canvas 保存和 SVG 分享；失败时应回退到已验证的镜像 digest。
