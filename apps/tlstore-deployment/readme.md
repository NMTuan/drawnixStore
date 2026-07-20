# tlStore 部署

此编排运行浏览器应用与 Nitro SVG 服务。PocketBase 可以是受管实例或同一私有网络中的独立服务；`NITRO_POCKETBASE_INTERNAL_URL` 必须只能被服务端访问，浏览器只使用 `VITE_POCKETBASE_URL`。

将 `.env.example` 中的变量写入本地 `.env.local` 后，在仓库根目录执行：

```bash
docker compose --env-file apps/tlstore-deployment/.env.local -f apps/tlstore-deployment/compose.yml up --build
```

首次部署或 PocketBase 集合变更后，使用受控服务端环境执行 `npm run bootstrap:tlstore`；不要将 PocketBase 管理员凭据写入浏览器构建变量。
