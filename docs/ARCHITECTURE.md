# HarnessHub 系统架构

状态：Draft v0.1

更新时间：2026-08-20

## 1. 架构原则

1. **先展示事实，再执行代码。** 每次安装都绑定不可变版本、来源和摘要。
2. **远端目录与本机执行分离。** API 无权直接修改用户电脑；桌面端只执行用户确认的操作。
3. **DSH 通过适配层接入。** DSH 处于开发者预览，业务域不能依赖其当前 CLI 输出或目录结构。
4. **版本级信任。** 扫描、风险和兼容性属于插件版本，不能只挂在插件名称上。
5. **失败可恢复。** 安装前记录状态，失败后提供明确恢复步骤，不掩盖部分修改。
6. **最少数据。** 浏览和本机安装历史默认不上传。

## 2. 目标仓库结构

```text
HarnessHub/
├── apps/
│   ├── web/                 # React Web 市场
│   ├── desktop/             # Tauri 2 桌面应用
│   └── api/                 # NestJS API 与后台任务入口
├── packages/
│   ├── ui/                  # Web/Desktop 共用 UI
│   ├── domain/              # 纯业务类型与状态机
│   ├── plugin-schema/       # HarnessHub 元数据与 DSH 解析模型
│   ├── dsh-adapter/         # CLI/清单/版本兼容适配
│   ├── api-client/          # 类型安全 API 客户端
│   └── config/              # lint、TypeScript、Tailwind 等共享配置
├── docs/
└── infrastructure/         # 部署定义；不存放生产密钥
```

Phase 1 首个骨架已建立用户指定的三个应用与三个共享包：`apps/desktop`、`apps/web`、`apps/api`、`packages/ui`、`packages/types`、`packages/plugin-schema`。`domain`、`dsh-adapter`、`api-client` 与 `config` 只在对应能力进入开发时创建，不预先放置空包。

Phase 1-B 新增 `packages/plugin-sources`，集中处理 GitHub/npm 读取、来源交叉核对和 Snapshot 生成。Mock 数据已移至 `tests/fixtures`，不会进入生产 Registry。

当前只读 Registry 的依赖方向：

```text
RegistryController → PluginService → PluginRepository
                                      ├── PrismaPluginRepository → PostgreSQL
                                      └── MemoryPluginRepository → tests/fixtures

manual allowlist → GitHubAdapter ┐
                 → npmAdapter    ├→ PluginSourceSync → immutable Snapshot
                                 ┘
```

API 和 UI 只依赖 `PluginRepository` 契约，不读取静态数组，也不直接调用 GitHub/npm。

## 3. 组件

### Web 应用

- React + TypeScript；
- Tailwind CSS + shadcn/ui；
- 负责公开市场、插件详情、开发者资料、提交和社区页面；
- 不调用本机命令，不声称网页按钮能完成本机安装；
- 可提供“在 HarnessHub Desktop 中打开”的签名深链，桌面端仍需再次确认。

### 桌面应用

- Tauri 2 + 共用 React UI；
- Rust 命令层负责进程调用、路径处理和本机状态读取；
- 检测 Node、pnpm、DSH 版本和可用 Profile；
- 只使用参数数组启动受允许的 DSH 命令，不经 shell 拼接用户输入；
- 安装前展示目标 Profile、包规格、固定 SHA/版本、风险和预期变化；
- 默认将安装日志保存在本机，脱敏后才可由用户主动提交诊断。

### API

- NestJS 模块化单体，v0.1 不拆微服务；
- Phase 1-B 只启用 Health 与只读 Registry 模块；
- `PluginService` 通过 `PluginRepository` token 注入持久化实现；
- 模块：Auth、Catalog、Ingestion、Moderation、Community、Requests、Audit；
- Prisma 访问 PostgreSQL；
- 验证 Supabase Auth 签发的 JWT，在服务端完成授权；
- 长任务写入队列，由 Worker 执行抓取、解析和扫描。

### 数据与对象存储

- PostgreSQL：用户、目录、版本、审核、社区与审计元数据；
- 对象存储：扫描报告、截图和证据附件；
- Redis 或兼容队列：仅在异步扫描进入实现阶段时引入；
- 不镜像第三方源码包，除非许可证、完整性和删除流程已经明确。v0.1 优先保存摘要与报告。

### 外部依赖

- GitHub：登录、仓库控制权、topic 候选发现和仓库元数据；
- npm Registry：包版本与制品元数据；
- Supabase：PostgreSQL 与 Auth（最终托管地区待定）；
- 第三方赞助平台：仅跳转链接，不进入交易链路。

## 4. 部署边界

推荐的 v0.1 部署：

- Web 静态资源：Cloudflare Pages；
- API/Worker：支持完整 Node.js 运行时的容器平台；
- 数据库/Auth：Supabase；
- 报告和图片：S3 兼容对象存储或 Cloudflare R2；
- CDN/WAF/DNS：Cloudflare。

NestJS API 不在 v0.1 强行部署为 Cloudflare Worker。这样保留 Prisma、扫描进程和常规 Node 依赖的可预测性。后续只有在有明确收益和兼容验证时才迁移边缘函数。

## 5. DSH 适配层

`packages/dsh-adapter` 是唯一理解以下细节的包：

- `dsh.bundle.patch` 清单；
- DSH Profile 和 Bundle 的概念；
- `dsh plugin --profile <name> add/remove/update`；
- `--dump-config` 验证；
- 当前 DSH 版本和兼容矩阵；
- CLI 退出码、错误分类和重启提示。

适配层输出稳定的 HarnessHub 域对象，例如：

```ts
type InstallCandidate = {
  pluginVersionId: string
  packageSpec: string
  immutableRef: string
  integrity?: string
  requiresInstallBuild: boolean
  targetProfile: string
}
```

业务 UI 不解析 CLI 文本，也不自行拼装 package spec。

## 6. 插件采集与发布流程

1. Phase 1-B 候选仅来自人工维护的可信来源白名单；自动发现留到后续阶段。
2. Ingestion Worker 读取仓库和包元数据。
3. Manifest Parser 验证包声明 `dsh.bundle.patch`，并解析补丁引用。
4. Resolver 将可变引用解析为提交 SHA、npm 精确版本和制品摘要。
5. Scanner 生成版本级发现项和覆盖说明。
6. Policy Engine 按规则分流：拒绝、人工复核或可发布。
7. 审核决定和证据写入审计日志。
8. Catalog 只发布通过当前策略的版本；旧版本结论不会自动复制。

采集器不直接把 GitHub topic 中的仓库视为已审核插件。

## 7. 安装事务

桌面端安装按状态机执行：

```text
resolved → consented → preflight_ok → installing → verifying → installed
                                      ↘ failed_recoverable
                                      ↘ failed_manual_recovery
```

### 预检

- 校验桌面端接收的深链和服务端响应签名；
- 重新解析版本，确认 SHA/摘要未变；
- 检测 DSH、Node、pnpm 和 Profile；
- 记录 Profile 清单与补丁文件的只读快照信息；
- 检测安装构建脚本和 `allowBuilds` 要求；
- 展示配置差异预览；无法可靠预览时明确说明。

### 执行

- 仅执行显示给用户并确认过的参数；
- GitHub 来源默认固定 commit；npm 来源固定精确版本；
- 不自动修改 `allowBuilds`；需要安装构建时暂停并让用户单独授权；
- 捕获退出码和有限、脱敏的输出。

### 验证

- 确认 Profile 依赖和 Bundle 列表与预期一致；
- 运行非启动型配置 dump；
- 提示添加、删除或更新 Bundle 后重启 Profile；
- 不为“命令返回 0”自动标记完全安全。

卸载和更新使用同一状态机。更新必须重新展示版本差异和新增风险。

## 8. API 边界

建议 v0.1 路由族：

```text
GET    /plugins
GET    /plugins/:slug
GET    /plugins/:slug/versions/:version
POST   /submissions
POST   /claims
POST   /plugins/:id/favorites
POST   /developers/:id/follows
POST   /plugins/:id/ratings
POST   /comments
POST   /reports
POST   /plugin-requests
POST   /plugin-requests/:id/claims
```

- 公共读接口使用游标分页和缓存；
- 写接口要求认证、CSRF/Origin 防护、速率限制和幂等键；
- 审核接口位于独立权限域，不与普通用户角色复用；
- 桌面安装不经过服务端远程命令接口。

## 9. 身份与授权

- Supabase Auth 使用 GitHub OAuth；
- HarnessHub `users` 保存认证主体，`profiles` 保存公开资料；
- 仓库控制权验证与 GitHub 登录是不同证据；
- 角色至少包括 user、moderator、admin，使用服务端策略判定；
- 管理员高风险操作要求重新认证并记录审计事件；
- 服务端密钥绝不进入 Web 或 Desktop 前端包。

## 10. 可观测性与隐私

- 记录请求 ID、错误分类、任务耗时和策略版本；
- 不在日志中保存 OAuth token、Cookie、源码私密内容或用户本机路径；
- 本机安装遥测默认关闭；安装计数采用用户主动选择和去标识化事件；
- 所有扫描报告记录工具版本、规则集版本、目标摘要和时间；
- 管理操作使用追加式审计表，不能由普通后台页面直接修改。

## 11. 测试策略

- 域状态机和策略：单元测试；
- Prisma 模型与授权：数据库集成测试；
- GitHub/npm/DSH 适配器：固定契约样本 + 少量真实端到端测试；
- 桌面命令层：临时 DSH Home/Profile、恶意参数和中断恢复测试；
- 核心闭环：Web 提交到发布、Desktop 预检到安装验证的端到端测试；
- 每个受支持的 DSH 版本都进入兼容矩阵，破坏性变化先让适配器测试失败。

## 12. 主要架构风险

| 风险 | 应对 |
|---|---|
| DSH 预览版破坏兼容 | 单一适配层、版本矩阵、快速禁用不兼容安装 |
| 第三方代码在安装或运行时执行 | 不可变引用、脚本提示、显式授权、分层扫描 |
| GitHub/npm API 限流或不可用 | 队列、退避、缓存、可重试任务 |
| 社区与扫描功能过早复杂化 | 模块化单体、先做规则和人工流程 |
| 桌面应用供应链风险 | 签名更新、固定依赖、发布制品证明和安全更新通道 |
