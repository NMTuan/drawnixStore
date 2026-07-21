# tlStore 部署

此编排运行浏览器应用、Nitro BFF、PocketBase、超级管理员初始化和一次性 Schema bootstrap。浏览器只请求 Web 同源的 `/api` 与 `/embed`。

将 `compose.yml` 和 `.env.example` 复制到任意部署目录，再将 `.env.example` 填写为 `.env.local`。部署主机不需要仓库源码或 Node 工具链，只需拉取已发布镜像并启动：

```bash
docker compose --env-file .env.local -f compose.yml pull
docker compose --env-file .env.local -f compose.yml up -d
```

默认镜像来自 `ghcr.io/nmtuan/drawnixstore`。生产部署应使用 GitHub Actions 成功发布后的 `sha-<短提交>` 不可变 `DRAWNIX_STORE_IMAGE_TAG`，确保 Web、API 与 bootstrap 来自同一提交；`latest` 仅适合测试。需要从 fork 或私有镜像仓库部署时覆盖 `DRAWNIX_STORE_IMAGE_REPOSITORY`。私有 GHCR 包需要先执行 `docker login ghcr.io`，或将包在 GitHub Packages 中设为公开。

Web 默认绑定 `0.0.0.0`。生产环境必须由外部 HTTPS 反向代理提供 `TLSTORE_PUBLIC_ORIGIN` 所对应的 TLS 入口，再将流量转发到 `TLSTORE_WEB_PORT`；不要直接暴露 HTTP 端口，否则浏览器会拒绝生产 Secure 会话 Cookie。

仅限受控的局域网 HTTP 调试，可将 `TLSTORE_PUBLIC_ORIGIN` 设置为完整的 `http://主机地址:端口` 并将 `NITRO_SESSION_SECURE=false`。此模式不适用于公网或生产部署。

`POCKETBASE_ENCRYPTION` 必须是安全随机的 32 字节值。示例中的值仅用于通过长度校验，部署前必须替换；更换现有生产数据卷的加密值会使旧数据不可读。

PocketBase 当前固定为已验证的 `0.39.8`。升级镜像前必须在独立数据卷上检查 `pocketbase-init`、`tlstore-bootstrap`、`pocketbase` 健康状态，并验证注册登录、Canvas 保存和 SVG 分享；失败时应回退到已验证的镜像 digest。
