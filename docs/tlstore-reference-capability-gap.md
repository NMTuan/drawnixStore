# tlStore 参考实现能力差异

本文记录 `../tlStore` 与当前 Drawnix 集成版 tlStore 的能力对比，作为后续迭代的范围依据。比较基线为参考仓库 `c474a94` 与当前项目提交 `599e77e`。

## 已覆盖能力

- 邮箱密码注册和登录，以及基于 PocketBase owner rule 的私有 Workspace、Canvas 数据访问。
- Workspace 创建、切换、重命名和最近访问时间记录。
- Canvas 创建、唯一 URL 打开、Drawnix 编辑、自动保存、手动保存、离线待保存、网络恢复重试、归档与恢复。
- 已保存 SVG 缩略图、公开只读分享页、可嵌入 SVG、48 位十六进制 bearer token 和分享开关。
- 分享 SVG 经由 Nitro 服务返回，不向匿名浏览器公开 Canvas JSON；无效、关闭、归档或不存在的 Canvas 统一返回占位 SVG。

## 待补齐能力

### Canvas 资源上传

参考实现有 `canvas_resources` 集合，支持仅 owner 可访问的图片文件上传与 Canvas 关联。当前 Drawnix 会保存画布中已有的图片数据，但没有独立资源记录、上传入口、文件类型控制、资源配额或生命周期管理。

优先级：高。资源能力应先以业务 API 和 PocketBase 私有 rule 实现，避免浏览器持有管理员凭据或依赖上游 Drawnix 内部实现。

### 自托管 PocketBase 编排

参考实现的 Compose 包含 PocketBase、超级管理员初始化、数据卷、健康检查和迁移目录。当前部署编排仅运行 tlstore-web 与 tlstore-api，要求由受管服务或独立容器提供 PocketBase。

优先级：高。为本地与自托管场景增加可选 PocketBase 服务、持久卷、管理员初始化任务和健康检查；受管 PocketBase 部署仍应保留现有外部地址配置。

### Schema 初始化与迁移

当前 `bootstrap:tlstore` 可重复执行并保留业务记录，但由部署步骤手工调用。参考实现会在应用启动前初始化 Schema，且保留 PocketBase 迁移文件。

优先级：中。将 bootstrap 作为 Compose 的一次性受控任务，并为后续不可逆 Schema 变更建立版本化迁移策略。

### 发布流水线

参考实现提供 GitHub Actions 容器构建与 GHCR 发布。当前项目没有 tlStore 专属的镜像构建、推送或部署验证工作流。

优先级：中。应在容器构建可稳定运行后添加 CI，分别构建 Web 与 API 镜像，并执行构建、测试、lint、Compose 配置校验与公开 SVG 端到端校验。

### 当前页面预览

参考 tldraw 将最后编辑 Page 的 SVG 与 `preview_page_id` 持久化。当前 Drawnix 保存完整 Board SVG，不存在 tldraw 的多 Page 模型，因此没有对应字段。

优先级：低。除非 Drawnix 公开支持可独立切换并导出多个页面，否则不应为匹配参考数据结构而引入虚假的页面概念。

## 非本次对比范围

两套实现都尚未提供团队协作、实时同步、Canvas 版本历史、永久删除、存储配额、备份、邮件验证、密码重置和公开注册的滥用防护。
