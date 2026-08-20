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
│   ├── i18n/                # Web/Desktop/UI 共用语言资源与运行时
│   ├── installation-prototype/ # 无系统副作用的安装状态机与 Fixture
│   ├── runtime-integration/  # 只读环境模型、DSH Adapter 与 Setup Plan
│   ├── dsh-adapter/         # CLI/清单/版本兼容适配
│   ├── api-client/          # 类型安全 API 客户端
│   └── config/              # lint、TypeScript、Tailwind 等共享配置
├── docs/
└── infrastructure/         # 部署定义；不存放生产密钥
```

Phase 1 首个骨架已建立用户指定的三个应用与三个共享包：`apps/desktop`、`apps/web`、`apps/api`、`packages/ui`、`packages/types`、`packages/plugin-schema`。`domain`、`dsh-adapter`、`api-client` 与 `config` 只在对应能力进入开发时创建，不预先放置空包。

Phase 1-B 新增 `packages/plugin-sources`，集中处理 GitHub/npm 读取、来源交叉核对和 Snapshot 生成。Mock 数据已移至 `tests/fixtures`，不会进入生产 Registry。

Phase 1-C 增加 Snapshot 历史/比较只读接口、隔离 PostgreSQL 集成测试，以及批量同步的逐来源失败报告。Prisma Driver Adapter 显式应用连接串中的 schema，避免测试 Schema 与生产 Registry 混用。

Phase 1-D 将列表查询下推 PostgreSQL：稳定排序、分页、trigram 文本索引和 GIN 标签索引。同步流程写入 SyncJob，并独立维护 GitHub/npm 当前可用状态；上游失效只改变当前状态，不删除版本或 Snapshot。

Phase 2-B1 已实现 GitHub-only 身份基础：内部 User 与 OAuthIdentity 分离，Role 与公开 Badge 分离，Founder 绑定 GitHub 数字 user ID。NestJS 后端拥有 callback、PKCE/state、Session 和授权事实；Web/Desktop 不接收 GitHub token。

Phase 2-B1.5 新增 `packages/i18n`：Web、Desktop 与共享 UI 使用同一强类型 translation key、React Provider 和 `zh-CN`/`en-US` JSON。默认中文，手动语言选择仅保存在本机；第三方插件内容不进入平台翻译资源。

Phase 2-C 在 NestJS 模块化单体内新增 `DeveloperTrustModule`。它复用服务端 HarnessHub Session，但把登录身份、仓库控制权、插件 Ownership、平台 Role 和公开 Badge 分成独立事实。首版 GitHub verifier 只读取公开仓库，不扩大 OAuth scope。

Phase 3-A 只定义 Plugin Submission 候选域，不创建模块或数据表。Submission 与公开 Registry 分离：Draft 可编辑，提交后的 SubmissionVersion 不可变；只有批准后的精确 revision 才能在幂等事务中生成 PluginVersion、首个 Snapshot 和 RegistryPublication。审核工作流状态与发布后的 ACTIVE/SUSPENDED/DELISTED 状态分离。

Phase 3-B 只定义 Installation Security 边界。Desktop 将服务端不可变版本事实转换为本机生成的 InstallationPlan；用户确认绑定 plan/version/Profile/permissions/environment digest。Environment Manager 通过 DSH Adapter 和 Platform Adapter 探测与执行，服务端、深链和 UI 都不能下发任意命令。事务使用 Profile 锁、持久 Recovery Journal 和明确的 FULL/PARTIAL/NONE 回滚覆盖度。

Phase 3-C 新增 `packages/installation-prototype` 纯内存状态机和 Desktop 权限确认面板。该包只接受 `SIMULATION_ONLY` Manifest；Mock Environment Manager 固定拒绝 DSH 执行与系统修改。成功、取消、失败回滚和 Recovery Required 都只追加模拟步骤与审计，不调用文件系统、网络、子进程、Tauri command 或包管理器。

Phase 4-A 新增 `packages/runtime-integration` 和一个无参数 Tauri command。原生层只运行硬编码的 Node.js、Git、DSH `--version` 探测，带 2 秒超时与 8 KiB 输出上限，不经过 Shell，也不接受程序、路径或参数输入。共享 DSH Adapter 只消费 Snapshot、判断兼容性并生成全部 `executable: false` 的 Setup Plan。真实 Snapshot 可进入模拟安装分析，但执行与系统修改标志继续固定为 `false`。

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

Developer Trust 的依赖方向：

```text
DeveloperTrustController -> AuthService (server session)
                         -> DeveloperTrustService
                              |-> PrismaDeveloperTrustRepository -> PostgreSQL
                              |-> GitHubRepositoryVerifier -> public GitHub REST

challenge success -> immutable evidence + unique ownership + role + badge + audit
```

未来 Submission 的依赖方向：

```text
DeveloperTrust / Ownership
  -> PluginSubmission -> immutable SubmissionVersion
       -> Source Verification
       -> Metadata / Compatibility / Security CheckRun
       -> Human Review when required
  -> publication transaction
       -> PluginVersion + initial PluginSnapshot + RegistryPublication
  -> Registry
```

新插件在发布前不创建公开 Plugin，从而避免未审核候选进入只读 Registry。首个插件开发者可在 Submission 内完成来源挑战，发布时才原子建立 Ownership，避免把平台变成只有既有开发者可进入的封闭目录。

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
- Phase 2-B1 直接处理 GitHub Authorization Code + PKCE callback，并在服务端完成 Session 与授权；
- 长任务写入队列，由 Worker 执行抓取、解析和扫描。

### 数据与对象存储

- PostgreSQL：用户、目录、版本、审核、社区与审计元数据；
- 对象存储：扫描报告、截图和证据附件；
- Redis 或兼容队列：仅在异步扫描进入实现阶段时引入；
- 不镜像第三方源码包，除非许可证、完整性和删除流程已经明确。v0.1 优先保存摘要与报告。

### 外部依赖

- GitHub：登录、仓库控制权、topic 候选发现和仓库元数据；
- npm Registry：包版本与制品元数据；
- Supabase 或兼容 PostgreSQL：数据库托管候选；Phase 2-B1 Auth 不依赖 Supabase Auth；
- 第三方赞助平台：仅跳转链接，不进入交易链路。

## 4. 部署边界

推荐的 v0.1 部署：

- Web 静态资源：Cloudflare Pages；
- API/Worker：支持完整 Node.js 运行时的容器平台；
- 数据库：Supabase PostgreSQL 或兼容托管 PostgreSQL；Auth callback 运行在 HarnessHub API；
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

Phase 3-B 的规范状态机：

```text
requested → resolving → analyzing → permission_review → awaiting_confirmation
  → confirmed → preparing → applying → verifying → committing
  → installed | updated | uninstalled

before_apply → cancelled | blocked | failed
after_change → rolling_back → rolled_back | recovery_required
```

### 预检

- 校验深链结构与服务端响应真实性；Installation Manifest 的签名/密钥方案在 Prototype 前确认；
- 重新解析版本，确认 SHA/摘要未变；
- 检测 DSH、Node、pnpm 和 Profile；
- 记录 Profile 清单与补丁文件的只读快照信息；
- 检测安装期第三方代码，并在普通模式显示“安装时执行第三方代码”；`allowBuilds` 等字段只进入开发者详情；
- 展示配置、权限和版本差异预览；无法可靠预览时明确说明并提高风险或阻断。

### 执行

- 仅执行与用户确认的 plan digest 绑定的步骤；底层参数只在开发者详情展示；
- GitHub 来源默认固定 commit；npm 来源固定精确版本；
- 不自动修改 `allowBuilds`；需要安装构建时暂停并用普通用户可理解的独立步骤确认；
- 捕获退出码和有限、脱敏的输出。

### 验证

- 确认 Profile 依赖和 Bundle 列表与预期一致；
- 运行非启动型配置 dump；
- 提示添加、删除或更新 Bundle 后重启 Profile；
- 不为“命令返回 0”自动标记完全安全。

卸载和更新使用同一事务模型。更新必须重新展示版本差异和新增风险；卸载只删除明确受管资源。脚本和外部服务副作用可能无法完整回滚，因此终态必须区分 `ROLLED_BACK` 与 `RECOVERY_REQUIRED`。完整设计见 `docs/INSTALLATION_SECURITY_ARCHITECTURE.md`。

## 8. API 边界

建议 v0.1 路由族：

```text
GET    /plugins
GET    /plugins/:slug
GET    /plugins/:slug/snapshots
GET    /plugins/:slug/snapshots/compare?from=:snapshotId&to=:snapshotId
GET    /plugins/:slug/versions/:version
GET    /sync-jobs?pluginId=:pluginId
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

- Phase 1-D 公开列表使用稳定排序和有上限的页码分页（`page`/`limit`，最大 100）；未来数据量和写入频率需要游标时再增加新契约；
- API 使用单进程内存限流作为基础保护，默认每个来源 IP 每分钟 120 次；多实例部署前需要共享限流存储；
- 查询参数由共享 Zod Schema 校验，未知参数、越界页码和非法 ID 返回统一 400；未知服务端错误不向客户端泄露内部信息；
- 写接口要求认证、CSRF/Origin 防护、速率限制和幂等键；
- 审核接口位于独立权限域，不与普通用户角色复用；
- 桌面安装不经过服务端远程命令接口。

## 9. 身份与授权

- Phase 2-B1 已以 GitHub-only OAuth 实现；Google 只能在安全账号绑定门槛通过后启用；
- HarnessHub `users` 保存内部主体，`oauth_identities` 保存 `(provider, issuer, provider_user_id)` 映射；当前直接 Session 模式不需要 `auth_principals`，该表只为未来 Auth broker 保留设计；Phase 2-C 已实现 DeveloperProfile，通用公开 User Profile 仍未实现；
- GitHub username、display name、email 和可编辑 provider metadata 不参与账号匹配或授权；
- NestJS 后端交换 GitHub code、读取稳定数字 ID 并签发 opaque HarnessHub Session；应用授权只读取数据库中的稳定 identity 与有效 RoleAssignment；
- 不允许 Auth broker 按相同 email 自动合并跨 provider 身份；目标部署无法关闭或隔离该行为时，不启用第二个 provider；
- 仓库控制权验证与 GitHub 登录是不同证据；
- Role 代表权限，Badge 只代表公开身份；两者使用独立表和独立读取路径；
- 角色包括 founder、admin、moderator、reviewer、developer、user，并由服务端 action + scope 策略判定；
- Founder 通过 GitHub 数字 user ID 的数据库 bootstrap 绑定，不通过用户名判断；
- 管理员高风险操作要求重新认证并记录审计事件；
- 服务端密钥绝不进入 Web 或 Desktop 前端包。

完整设计见 `docs/IDENTITY_ARCHITECTURE.md`。

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
