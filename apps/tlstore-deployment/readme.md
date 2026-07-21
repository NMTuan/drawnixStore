# tlStore 部署

此编排运行浏览器应用、Nitro BFF、PocketBase、超级管理员初始化和一次性 Schema bootstrap。浏览器只请求 Web 同源的 `/api` 与 `/embed`。

将 `.env.example` 中的变量写入本地 `.env.local` 后，先在宿主机构建产物，再创建运行镜像：

```bash
npm run build:tlstore-images
docker compose --env-file apps/tlstore-deployment/.env.local -f apps/tlstore-deployment/compose.yml up --build
```

Web 默认绑定 `0.0.0.0`。生产环境必须由外部 HTTPS 反向代理提供 `TLSTORE_PUBLIC_ORIGIN` 所对应的 TLS 入口，再将流量转发到 `TLSTORE_WEB_PORT`；不要直接暴露 HTTP 端口，否则浏览器会拒绝生产 Secure 会话 Cookie。

仅限受控的局域网 HTTP 调试，可将 `TLSTORE_PUBLIC_ORIGIN` 设置为完整的 `http://主机地址:端口` 并将 `NITRO_SESSION_SECURE=false`。此模式不适用于公网或生产部署。

`POCKETBASE_ENCRYPTION` 必须是安全随机的 32 字节值。示例中的值仅用于通过长度校验，部署前必须替换；更换现有生产数据卷的加密值会使旧数据不可读。
