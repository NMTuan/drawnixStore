# Drawnix Store 集成计划

## 目标

在不迁移 Next.js、不修改 Drawnix 上游核心包的前提下，基于当前 Drawnix fork 建立私有 Canvas 工作区产品能力：认证、工作区、持久化画布、归档、公开只读分享和可嵌入 SVG。

当前 `apps/web` 是上游 Drawnix 的最小化应用，`packages/drawnix`、`packages/react-board`、`packages/react-text` 属于需要持续跟随官方升级的核心。业务实现不得直接进入这些位置。

## 核心原则

1. 上游零侵入：仅使用 `@drawnix/drawnix` 的公开导出、Props、回调和插件 API。
2. 业务隔离：新增应用、业务包和服务端代码全部以 `tlstore-` 前缀隔离。
3. 不复制内部实现：不修改或复制 Drawnix、Plait 的内部源码、样式和未导出状态。
4. 服务端最小职责：Vite 继续只托管浏览器应用；动态 SVG、鉴权边界和持久化 API 由独立业务服务完成。
5. 数据格式独立：Drawnix 的画布 JSON 作为业务记录的快照内容保存，不复用或迁移 tldraw 快照格式。

## 推荐边界

```text
apps/
  web/                    # 上游 Drawnix 示例应用，保持不改
  tlstore-web/            # 私有工作区浏览器应用，引用 @drawnix/drawnix 公开 API
  tlstore-api/            # 动态 SVG、认证辅助与业务 HTTP 端点
packages/
  tlstore-domain/         # Canvas、Workspace、Share Link 的类型、序列化和纯函数
  drawnix/                # 上游核心包，保持不改
  react-board/            # 上游核心包，保持不改
  react-text/             # 上游核心包，保持不改
```

若初期不需要拆分 Nx 应用，`tlstore-web` 和 `tlstore-api` 也可以先部署为仓库外的独立应用；关键要求是不得向上游 `apps/web` 与 `packages/*` 注入 tlStore 业务逻辑。

## 编辑器集成

`tlstore-web` 使用 `Drawnix` 组件的公开接口：

- 初始化：将业务记录中保存的 Drawnix JSON 映射为 `value`、`viewport`、`theme` 和工具状态。
- 保存：消费 `onChange`、`onToolStateChange` 等公开回调，防抖写入业务 API。
- UI 外壳：工作区导航、Canvas 列表、保存状态、分享操作和错误提示由 `tlstore-web` 自己实现；编辑区内部仍由 Drawnix 渲染。
- 升级检查：每次升级 `@drawnix/drawnix` 时验证 Props、回调返回值、保存 JSON 和 SVG 导出结果，禁止通过访问编辑器内部实例兜底。

当前 Drawnix 示例应用将 `children`、`viewport`、`theme` 和工具状态存储在 localforage。tlStore 的首版可沿用同一业务形状，但写入服务端记录；浏览器 localforage 只用作离线待保存队列，不能作为唯一真相来源。

## 领域模型

### Workspace

- 由一个 User 私有拥有的 Canvas 集合。
- 可创建、切换和重命名；首版不删除。
- 列表按 `created` 倒序固定排序，进入工作区只更新 `last_accessed`，不得改变列表位置。

### Canvas

- 独立的 Drawnix 文档，属于一个 Workspace。
- 记录包含标题、Drawnix 快照、视口、主题、工具状态、最后保存 SVG 预览、归档状态、修订号和审计时间。
- 自动保存使用“最新成功保存优先”的串行队列；离线时将待保存项写入浏览器本地存储，恢复网络后重试。

### Share Link

- 使用高熵 bearer token。
- `share_enabled` 是唯一公开访问开关，普通分享页与嵌入 SVG 共用此开关。
- 关闭开关后，所有已发出的访问链接和嵌入地址都必须在服务端立即失效。

## 数据服务与鉴权

PocketBase 可以继续承担认证和数据存储，也可以由独立业务 API 适配其他存储。无论实现如何，以下规则必须保留：

- 私有 Workspace 和 Canvas 仅 owner 可读写。
- Canvas 创建和更新必须校验 Workspace owner。
- 公开读取仅在 `share_enabled = true`、token 非空且与请求 token 匹配时成立。
- 前端不得持有管理员凭据。
- API URL 从环境变量获取；浏览器与服务端使用不同变量名和最小权限地址。

## 分享与嵌入

### 普通分享

普通分享页由 `tlstore-web` 提供，例如：

```text
https://app.example.com/share/<token>
```

页面读取允许公开访问的 Canvas，并以只读模式展示最后保存 SVG 或 Drawnix 只读预览。

### 嵌入 SVG

静态 Vite 应用不能根据 token 返回动态 `image/svg+xml`，因此需要 `tlstore-api` 提供专用端点：

```text
GET https://api.example.com/embed/<token>.svg
```

响应规则：

- 分享开启且 token 有效：返回最新保存的 SVG，`Content-Type: image/svg+xml; charset=utf-8`。
- token 无效、分享关闭、Canvas 已归档、不存在或没有 SVG：返回 HTTP `200` 的统一不可用 SVG，不泄露具体原因。
- 使用 `Cache-Control: no-cache, max-age=0, must-revalidate`，确保第三方网页重新加载时取得最新已保存预览。
- 返回 `Content-Security-Policy: sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'` 和 `X-Content-Type-Options: nosniff`，仅允许 Drawnix 导出 SVG 中的内嵌图片与必要样式，降低 SVG 作为嵌入资源的攻击面。

分享弹窗应同时提供：

```html
<img src="https://api.example.com/embed/<token>.svg" alt="Canvas preview" />
```

普通链接与嵌入代码只能在分享开关开启后复制。

## 实施顺序

1. 建立 `tlstore-domain` 类型、序列化合同和单元测试，不接触上游包。
2. 建立数据服务与 PocketBase collection/rule 初始化，验证私有与公开访问边界。
3. 建立 `tlstore-api` 的嵌入 SVG 路由及占位 SVG 响应测试。
4. 建立 `tlstore-web`：认证、工作区、Canvas 列表、归档、分享弹窗和保存状态。
5. 仅通过 Drawnix 公开组件完成编辑器加载、自动保存、恢复与 SVG 预览导出。
6. 添加 Playwright 场景：注册、创建工作区、编辑保存、归档恢复、分享开关、嵌入有效与无效 SVG。
7. 将上游升级检查加入 CI：构建、单测、端到端测试和 Drawnix 快照兼容性检查。

## 已知风险与对策

| 风险 | 对策 |
| --- | --- |
| Drawnix 公开 API 变更 | 只在 `tlstore-web` 的单一适配层调用公开 API，并为保存/恢复添加契约测试。 |
| 上游 JSON 格式变化 | 保存版本号；升级时提供只前进的数据迁移，不改写用户原始快照。 |
| Vite 无法提供动态 SVG | 使用独立 `tlstore-api`，不在 Vite middleware 中实现生产业务路由。 |
| 分享 token 泄露 | 视 token 为 bearer credential；使用安全随机值、服务端规则校验，并允许立即关闭。 |
| SVG 注入与缓存陈旧 | 仅输出受控导出 SVG，设置安全响应头与 revalidate 缓存策略。 |
| Fork 难以同步 | 禁止修改 `packages/*` 上游核心；所有业务放在 `tlstore-*` 边界并维持最小依赖面。 |

## 验收标准

- 可以无冲突地合并或 rebase 上游 Drawnix 更新，业务改动不落入上游核心包。
- 私有 Canvas 不会通过未授权 API 或嵌入端点泄露。
- 关闭分享后，普通分享与嵌入 SVG 均立即返回不可用结果。
- 第三方网页刷新后，`img` 可读取最新一次成功保存的 SVG。
- `npm run build`、`npm run test`、相关 Playwright 用例与格式检查通过。
