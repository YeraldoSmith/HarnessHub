# HarnessHub 路线图

状态：Draft v0.1

规则：每一阶段以可验证退出条件结束，不按功能数量宣布完成。

## Phase 0：定义与风险基线（已完成）

### 交付

- 产品范围、非目标和成功标准；
- 系统架构、数据模型和 DSH 适配边界；
- 安全模型、社区准则和开发者发布规范；
- 法律/品牌待办和关键决策清单；
- 锁定一份官方 DSH 参考版本。

### 退出条件

- P0 产品决策有负责人和结论；
- 所有文档对插件来源、安装授权和资金边界的表述一致；
- 确认首发平台与部署地区；
- 确认谁承担高风险插件人工审核。

## Phase 1：只读 Registry

状态：Completed（Phase 1-D）

### 目标

先证明平台能准确识别和解释真实 DSH Bundle。

Phase 1 当前实现先以一个明确标识的 Mock Plugin 打通 Schema、API 与 UI；真实 GitHub/npm 采集是本阶段的后续工作，不在首个骨架中伪装完成。

### Phase 1-B：Real Plugin Registry（已完成）

- Repository 抽象与 Memory/PostgreSQL 实现；
- PostgreSQL + Prisma 迁移；
- GitHub/npm Source Adapter 与来源证据；
- 不可变 PluginVersion 与 PluginSnapshot；
- 手工白名单中的首个真实 DSH Bundle；
- Web/Desktop 从同一真实 Registry API 读取；
- Mock Plugin 移至测试 fixture。

### Phase 1-C：Registry Hardening（已完成）

- 人工白名单扩展为 3 个真实 GitHub/npm 来源；
- Snapshot 历史与版本比较只读 API；
- 重复同步复用不可变 PluginVersion，同时追加新 Snapshot；
- PostgreSQL 隔离 Schema 集成测试；
- GitHub/npm 身份失配测试与逐来源同步失败报告；
- Web 详情页展示 Snapshot 历史。

### Phase 1-D：Registry Production Hardening（已完成）

- `page` / `limit` 稳定分页与 Web 导航；
- PostgreSQL 名称、描述、分类、作者、标签搜索；
- SyncJob 生命周期与只读状态 API；
- GitHub/npm 当前可用状态和最后验证时间；
- 上游失效保留历史版本、证据与 Snapshot；
- 单进程基础限流、严格输入校验与统一错误响应；
- 分页、搜索、SyncJob、来源失效和 PostgreSQL 集成测试。

Phase 1 至此结束。Phase 2 Identity Foundation 不在本阶段实现。

### 交付

- Monorepo、CI、环境配置和共享类型；
- `apps/desktop`、`apps/web`、`apps/api` 基础应用；
- `packages/ui`、`packages/types`、`packages/plugin-schema` 共享包；
- 至少一个通过共享 Schema 校验的 Mock Plugin；
- 手工白名单来源采集；
- npm/GitHub 来源解析；
- Bundle 清单和 patch 校验；
- 插件列表、详情、版本页与搜索；
- 不可变来源、许可证、兼容性和风险信息展示；
- 基础管理员查看页（后续阶段，不属于 Phase 1-B）。

### 明确不含

账号提交、评论、评分、推荐、打赏、Bounty、复杂审核后台、桌面安装、资金和自动上架。

### 退出条件

- 至少 10 个真实候选仓库的解析结果经人工抽查；
- 可正确区分 Bundle 与普通依赖；
- 任一公开版本都能追溯到精确来源；
- 采集失败可重试且不会发布半成品。

## Phase 2：身份、提交与审核

### 目标

让开发者完成从认领到发布的闭环。

### Phase 2-A：Identity Foundation Architecture（已完成）

- User 与 OAuthIdentity 多身份模型；
- 显式 Account Linking、冲突与恢复规则；
- Founder/Admin/Moderator/Reviewer/Developer/User Role 模型；
- Role 与公开 Badge 分离；
- Founder 绑定 GitHub 数字 user ID 的数据库 bootstrap；
- Developer Claim 与 PluginOwnership 预留模型；
- GitHub-only 先行、Google 延后到安全绑定门槛通过的实施顺序。

本阶段未创建 Prisma 身份表、OAuth 回调、登录 UI、用户中心或社区功能。

### Phase 2-B1：GitHub OAuth（已完成）

- 只启用 GitHub provider；
- 创建身份数据迁移、服务端 callback/session 和 Founder bootstrap；
- username、display name、email 不得影响用户匹配或授权；
- 普通 API 无法创建、撤销或转移 Founder。
- Web 使用 HttpOnly Cookie，Desktop 使用一次性 exchange 获取服务端 opaque Session；
- GitHub access token 不进入客户端或业务数据库；
- state 回放、Founder 改名/冒名和 Desktop 重复交付具备安全回归测试。

### Phase 2-B1.5：Localization Foundation（已完成）

- 新增 Web/Desktop/UI 共用 `packages/i18n`；
- 初始支持 `zh-CN` 与 `en-US`，默认 `zh-CN`；
- 提供语言切换、本机持久化和未来系统语言检测接口；
- 抽离登录、搜索、状态、错误、Registry 与身份 Badge 等优先界面文字；
- 插件名称、描述、README 与开发者内容保持作者原文；
- 不修改 Registry 数据模型或 OAuth 逻辑。

### Phase 2-C：Developer Trust Foundation（已完成）

- DeveloperProfile 与服务端控制的 verification status；
- 已有 Registry Plugin 的 DeveloperClaim；
- 公开 GitHub canonical repository 默认分支一次性挑战；
- 稳定 repository/owner 数字 ID、commit SHA 与不可变 VerificationEvidence；
- 唯一 OWNER、Developer Role 和 Verified Developer Badge 原子授予；
- Profile/Claim/Ownership Audit Event 与异常路径回归测试；
- 登录 OAuth scope 不扩大，GitHub token 不保存。

本阶段没有插件上传、自动发布、安装或审核后台。

### Phase 2-B2：Google OAuth 与 Account Linking（安全门槛后）

- 目标 Auth broker 必须禁用或隔离按 email 自动合并；
- 实现 recent-auth、短时 Link Intent、PKCE/state/nonce、冲突拒绝和解绑；
- 通过账号接管、重放、并发和高权限测试后再开放。

### 交付

- GitHub 登录和公开资料；
- 仓库/包所有权挑战；
- 插件提交与新版本提交；
- L0/L1 扫描和版本级报告；
- 人工审核队列、理由、审计和申诉；
- 安全联系与紧急下架入口。

### 退出条件

- 一个外部测试开发者能独立完成认领与发布；
- 高风险版本无法绕过人工审核；
- 审核状态、作者验证和扫描状态在 UI 中明确分离；
- 下架不会删除证据或历史版本信息。

## Phase 3：可信发布与安全安装

### Phase 3-A：Plugin Submission Architecture Design（已完成）

- 开放提交与首个新开发者来源验证路径；
- Draft、不可变 SubmissionVersion 和发布后 Publication 双层状态机；
- Source、Metadata、Compatibility、Security、Human Review 边界；
- LOW/MEDIUM/HIGH/CRITICAL 风险路由与权限声明；
- 透明 reason code、Changes Requested、拒绝、暂停和申诉模型；
- 与现有 Ownership、PluginVersion、PluginSnapshot、Source Evidence 的发布事务设计。

本阶段没有创建数据表、API、上传 UI、扫描 Worker、Reviewer 后台或安装代码。

### Phase 3-B：Installation Security Architecture（已完成）

- 安装、更新、卸载、Repair 的事务与本机安装状态分离；
- 可理解权限、内部能力来源与实际 enforcement 范围；
- Submission Risk + 本机环境/权限差异形成 Installation Risk；
- 与精确 plan/version/Profile/permissions/environment digest 绑定的单次确认；
- Profile 锁、Recovery Journal、FULL/PARTIAL/NONE 回滚覆盖度；
- macOS/Windows/Linux Platform Adapter 与 capability matrix；
- DSH Adapter、Environment Manager 和独立 Setup Assistant 接口；
- Publication suspension 阻止新安装/更新但不远程静默卸载。

本阶段没有探测或修改用户环境，没有执行 DSH、Shell、pnpm 或 Node 命令。

### Phase 3-C：Plugin Installation Prototype（已完成）

已建立 Analyze → Permission Review → Confirmation → Simulated Transaction → Recovery 闭环。Prototype 使用纯内存 Fixture 与 Mock Environment Manager，不接触 DSH Home/Profile、真实凭据、插件制品、安装脚本或用户环境。

#### Phase 3-C 目标

验证用户可理解的安全安装流程能够形成完整模拟闭环。

#### Phase 3-C 交付

- `packages/installation-prototype` 纯 TypeScript Mock Engine；
- simulation-only Manifest 与无害 Fixture；
- Desktop 权限、原因、范围与风险确认 UI；
- 成功、取消、失败、回滚和 Recovery Required 状态；
- 绑定内部 User ID 的事务访问控制；
- 只追加、不可修改的进程内 Audit Event；
- `EnvironmentManager` 跨平台接口与无执行 Mock 实现。

#### Phase 3-C 退出条件

- 正常、取消、失败回滚、恢复失败和未授权访问测试通过；
- Permission Review 使用普通用户可理解文案；
- Engine 不导入或调用执行、下载、文件系统或环境修改能力；
- Mock Environment 明确禁止 DSH 执行和系统修改；
- Web/API/Desktop/共享包/Rust 壳回归检查通过。

真实 Installation Engine 与 DSH Setup Assistant 仍是独立评估阶段，不属于 Phase 3-C。

## Phase 4：受控 Runtime 集成

### Phase 4-A：Controlled Runtime Integration Prototype（已完成）

- 打包 Desktop 真实只读检测 OS、CPU architecture、Node.js、Git 与 DSH；
- 原生探测无输入、固定 `--version`、无 Shell、带超时与输出上限；
- `packages/runtime-integration` 提供 Environment Manager、DSH Adapter 和三平台能力接口；
- DSH 缺失、兼容、不兼容和未知状态分离；
- Setup Assistant 展示步骤与未来权限，但只生成不可执行计划；
- Runtime Snapshot 接入 Phase 3-C 模拟事务，真实执行标志仍为 false；
- Trusted Install 预留官方测试插件 + LOW + 完整 Manifest + Verified Developer 边界；
- 无自动安装、无插件代码、无 Profile/PATH/系统修改。

下一阶段只能从隔离 Profile、受信固定制品和单平台最小真实切片开始，并需先通过恢复、签名、路径与原生命令安全门槛。

## Phase 5：社区与需求市场

### 目标

增加高质量反馈，而不是泛社交。

### 交付

- 收藏、关注、评分、评论；
- 举报、处罚通知和申诉；
- Plugin Requests、认领和进度；
- 第三方 Support 链接；
- 反刷、限流和基础透明度指标。

### 退出条件

- 所有用户内容都有举报入口；
- 审核员能按准则处理并记录理由；
- Plugin Requests 没有内部资金、余额、托管或提现概念；
- 收藏和本机安装历史保持默认私密。

## Phase 6：生态质量

### 候选能力

- 兼容性自动矩阵；
- 隔离动态分析；
- 精选集合和维护健康度；
- 团队作者账号；
- 多语言；
- 聚合透明度报告；
- 可验证构建与更强供应链证明。

每项必须先有威胁模型、数据需求和可逆发布方案。

## 暂不排期

- 平台支付、分账、托管和争议仲裁；
- 插件云端运行；
- 通用 Agent 市场；
- 私信和社交动态；
- 自动授予高风险权限；
- 对插件“绝对安全”的认证计划。

## 全程质量门槛

- 每个功能同时具备正常路径、失败路径和撤销路径；
- 每个信任标签有可验证定义；
- 每个外部集成都有限流、失败和契约变化策略；
- 每个收集的数据字段有用途、保留期限和删除规则；
- 每个管理员动作可审计；
- 每次 DSH 基线升级先运行适配器契约测试。
