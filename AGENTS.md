# AGENTS.md instructions

<INSTRUCTIONS>
请始终以中文与用户对话。

## 上游隔离

本仓库是 Drawnix 的 fork，首要目标是能够持续同步上游更新。

- 禁止直接修改 `packages/drawnix`、`packages/react-board`、`packages/react-text` 及其他上游核心包的业务源码、样式、构建配置或测试，除非用户明确批准并记录无法通过公开 API 实现的原因。
- 业务能力必须放在独立的 `apps/tlstore-*`、`packages/tlstore-*` 或仓库外独立服务中；通过 `@drawnix/drawnix` 的公开导出、Props、回调和插件机制集成。
- 不要复制、补丁或 fork Drawnix 内部实现；不要依赖未导出的内部路径、DOM 结构、私有 CSS class 或非文档化状态。
- 新增依赖必须局限在业务应用或业务包。升级 Drawnix 或 Plait 前先验证公开 API、序列化数据与端到端工作流。
- 上游同步前后必须运行 `npm run build`、相关测试，并检查 `apps/tlstore-*` 对公开 API 的兼容性。

## 文档与注释

修改或新增非自动生成文件时，务必同步补充清晰的中文注释与 JSDoc：

- TypeScript、配置脚本、工具函数、模块入口等文件，应说明模块职责、关键导出、重要函数和复杂逻辑。
- React 组件应说明组件职责；涉及持久化、鉴权、编辑器生命周期、异步状态或事件桥接时补充必要中文注释。
- 样式、环境变量、构建配置、自动化脚本和服务端路由，应说明配置目的、影响范围及维护边界。
- 自动生成文件无需手工补注释；不得直接修改自动生成结果。

## 命名与样式

- 除生态固定入口外，文件和目录统一使用小写字母、数字与连词线，例如 `canvas-session.tsx`；不得使用大写文件名。
- React 组件导出可以使用 PascalCase；文件名仍使用小写连词线。
- 沿用项目已有的 SCSS、CSS Modules 和 classnames 模式。不要为业务应用引入新的全局样式体系，也不要修改上游全局样式。
- 使用已有格式化和 lint 工具：`npm run format`、`npm run lint`。不要手工改写上游格式化配置。

## Git 约定

- Git 提交信息必须使用中文 Conventional Commits 格式：`type: 中文说明`。
- 功能从 `develop` 创建 `feature/*` 分支；未经用户明确要求，不直接在 `main` 或 `develop` 上开展业务开发、合并、删除或推送分支。
- 提交前先完成与改动范围匹配的 review 和验证；不要提交 `node_modules`、`dist`、`.nx` 缓存或本地密钥。

## 服务与鉴权

- 浏览器端只使用公开环境变量和受限 token；管理员凭据、数据库连接串及服务端私钥只能存在于服务端环境。
- 动态 SVG、公开嵌入、鉴权和数据写入必须通过业务服务或 PocketBase 的公开 API 规则实现，不能依赖 Vite 静态站点路由。
- Bearer 分享 token 必须使用安全随机源生成；关闭分享必须在服务端访问规则和嵌入端点中同时生效。
</INSTRUCTIONS>
