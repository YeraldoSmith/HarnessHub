# Plugin Submission Architecture

状态：Phase 3-A 架构设计完成，尚未实现数据表、API、上传 UI 或审核系统

## 1. 目标与产品立场

Plugin Submission 负责回答：一个开发者提交的精确插件版本，如何经过可解释、可追溯的验证后进入 Registry。

HarnessHub 采用：

- 开放提交：新开发者和既有开发者都能进入相同流程；
- 透明风险：公开声明、观察事实、检查范围和风险理由；
- 分级审核：风险决定审核深度，不决定开发者是否有资格被听见；
- 不可变发布：审核对象和最终 Registry PluginVersion 必须是同一精确来源；
- 可申诉：拒绝、暂停和人工覆盖都有理由、政策版本和复核入口。

HarnessHub 不采用邀请制目录、仅凭 Badge 自动发布、黑箱风险分数或“Verified 等于安全”的表达。

## 2. 系统关系

```text
Identity
  -> DeveloperProfile
  -> DeveloperTrust / source control evidence
  -> PluginSubmission
       -> immutable SubmissionVersion
       -> source verification
       -> metadata and compatibility checks
       -> security analysis
       -> human review when required
  -> publication transaction
       -> Plugin / PluginOwnership
       -> immutable PluginVersion
       -> initial PluginSnapshot
  -> Registry
  -> future Installation preflight
```

Submission 是进入 Registry 前的候选域，不是 Registry 的临时可变部分。未发布候选不能出现在公开 Registry API，也不能被 Desktop 安装。

## 3. 谁可以提交

### 3.1 已有插件的新版本

提交者必须：

- 有有效 Session 和非受限 DeveloperProfile；
- 对目标 Plugin 具有未撤销的 OWNER 或未来明确授权的 MAINTAINER Ownership；
- 提交来源与 Ownership 中的稳定 repository identity 一致；来源迁移必须先重新验证，不能只修改 URL。

Verified Developer Badge 不是授权依据；服务端读取 PluginOwnership。

### 3.2 首个新插件

为避免“没有 Ownership 就不能提交、没有提交又不能获得 Ownership”的封闭循环：

- 任意已登录且非受限的 DeveloperProfile 都可创建新插件 Draft；
- 未验证开发者必须在 Source Verification 阶段完成与 Phase 2-C 同等级别的仓库控制权挑战；
- 挑战成功只证明该来源的控制权，不提前把候选放入 Registry；
- 发布事务创建 Plugin、首个 OWNER、PluginVersion、Snapshot，并在满足规则时授予 Developer Role 与 Verified Developer Badge；
- 新开发者不会因账号年龄或没有 Badge 被默认拒绝，也不会绕过来源验证。

### 3.3 团队与组织

模型预留 Organization Delegate、Maintainer 和团队授权，但未来团队能力实现前不得把 GitHub organization login 当作权限。团队提交必须最终落到稳定组织 ID、稳定用户 ID 和明确 Ownership scope。

## 4. 两层状态机

审核工作流与发布后的治理必须分离。`SUSPENDED` 是已发布版本的分发状态，不应与待审核 Submission 混在一个字段中。

### 4.1 Submission 状态机

```text
DRAFT
  -> SUBMITTED
  -> METADATA_CHECKING
  -> SOURCE_VERIFICATION
  -> COMPATIBILITY_CHECKING
  -> SECURITY_ANALYSIS
  -> REVIEW_PENDING -----------+
  -> APPROVED                  |
  -> PUBLISHING                |
  -> PUBLISHED                 |
                               |
Any checking state             |
  -> CHANGES_REQUESTED --------+-> new immutable SubmissionVersion
  -> REJECTED
  -> WITHDRAWN
  -> EXPIRED
```

状态含义：

| 状态 | 含义 | 可修改性 |
|---|---|---|
| `DRAFT` | 仅提交者可见的可编辑草稿 | 可编辑；不形成审核事实 |
| `SUBMITTED` | 已冻结一个 SubmissionVersion，等待任务调度 | 该版本不可修改 |
| `METADATA_CHECKING` | 校验 Schema、许可证、必填披露和标识一致性 | 只写 CheckRun |
| `SOURCE_VERIFICATION` | 固定来源并验证提交者控制权、commit/package identity | 只写 Evidence |
| `COMPATIBILITY_CHECKING` | 对锁定 DSH 基线执行清单和契约检查 | 只写 CheckRun |
| `SECURITY_ANALYSIS` | 比对权限声明、脚本、依赖和可疑行为 | 只写 CheckRun/Finding |
| `REVIEW_PENDING` | 需要人工判断或等待发布批准 | 候选不可修改 |
| `CHANGES_REQUESTED` | 给出可执行理由，允许提交新 revision | 旧版本保留，新建 SubmissionVersion |
| `APPROVED` | 精确候选和 Evidence 已批准，等待发布事务 | 不可修改 |
| `PUBLISHING` | 幂等发布事务处理中 | 不接受新决定 |
| `PUBLISHED` | 已映射到 Registry 的不可变 PluginVersion/Snapshot | 终态；治理转入 Publication |
| `REJECTED` | 当前候选不满足明确规则 | 终态；可申诉或以新 Submission 重交 |
| `WITHDRAWN` | 提交者主动撤回 | 终态；保留审计 |
| `EXPIRED` | 长期未完成挑战或补充 | 终态；可重新提交 |

转换规则：

- 只有 `DRAFT` 可原地编辑；首次 `SUBMITTED` 后每个 revision 永久保留；
- 检查失败不直接覆写内容，而是进入 `CHANGES_REQUESTED`、`REJECTED` 或明确的可重试任务失败状态；
- GitHub/npm 临时不可用是 CheckRun 的 `ERROR` 且 `retryable = true`，不是开发者的 `REJECTED`；
- 提交者可以从非 `PUBLISHED`、非 `PUBLISHING` 状态撤回，但不能删除历史 Evidence；
- `APPROVED -> PUBLISHED` 必须确认候选摘要仍与批准对象一致。

### 4.2 Publication 状态机

```text
ACTIVE
  -> SUSPENDED
       -> ACTIVE       (复核后恢复)
       -> DELISTED     (最终停止分发)

ACTIVE -> DEPRECATED   (作者主动停止维护，历史仍可追溯)
```

- `SUSPENDED` 暂停新安装/更新，但保留页面、版本、Snapshot、决定理由和安全提示；
- `DELISTED` 不删除历史事实；是否允许已安装用户获取修复信息由 Installation policy 决定；
- 紧急暂停可先执行后通知，但必须有时限、负责人、证据和复核；
- 新版本发布不覆盖旧版本的 Publication 状态。

## 5. 概念数据模型

本节是未来 Prisma 设计，不代表当前数据库已经存在这些表。

### 5.1 PluginSubmission

```text
id
kind                    NEW_PLUGIN | NEW_VERSION | METADATA_CORRECTION
submitter_user_id
developer_profile_id
target_plugin_id?       NEW_PLUGIN 时为空
authorization_ownership_id?
proposed_slug?          NEW_PLUGIN 使用
status
active_submission_version_id?
lock_version            乐观并发控制
submitted_at?
resolved_at?
created_at
updated_at
```

规则：

- `target_plugin_id` 与 `authorization_ownership_id` 由服务端解析，不能信任前端；
- `NEW_VERSION` 必须绑定目标 Plugin 与有效 Ownership；
- `NEW_PLUGIN` 在发布前不创建公开 Plugin 记录；
- 同一 Plugin + version identity 只能有一个非终态 Submission；
- `lock_version` 防止多个浏览器标签静默覆盖 Draft。

### 5.2 SubmissionVersion

```text
id
submission_id
sequence
declared_version
source_provider
canonical_repository_url?
repository_external_id?
source_owner_type?
source_owner_external_id?
source_commit?
package_name?
npm_version?
artifact_integrity?
manifest_digest
metadata_json
compatibility_declaration_json
permission_declaration_digest
changelog
created_by_user_id
created_at
submitted_at?
```

- Draft revision 可在提交前更新；一旦 `submitted_at` 非空，数据库禁止 UPDATE/DELETE；
- 新的补充或修复创建递增 `sequence`，旧 CheckRun 和 ReviewDecision 仍绑定旧 revision；
- branch、tag、`latest` 只能作为输入；提交前必须解析为 commit SHA、精确 npm 版本和制品 integrity；
- GitHub 与 npm 同时存在时需要身份交叉核对，冲突不能由人工口头覆盖。

### 5.3 SubmissionSourceEvidence

```text
id
submission_version_id
provider
repository_external_id?
source_owner_external_id?
canonical_url
commit_sha?
package_version?
artifact_integrity?
ownership_evidence_ref
observed_payload_redacted
observed_at
created_at
```

成功 Evidence 追加且不可变。原始 access token、Cookie、私有源码和完整上游响应不能保存。

### 5.4 SubmissionCheckRun / SubmissionFinding

```text
SubmissionCheckRun
  id, submission_version_id, check_type, status,
  tool_name, tool_version, ruleset_version,
  started_at, finished_at, summary, error_code?, retryable

SubmissionFinding
  id, check_run_id, code, category, severity,
  title, explanation, evidence_redacted,
  remediation, disposition, created_at
```

`check_type`：`METADATA`、`SOURCE`、`COMPATIBILITY`、`SECURITY`。

`status`：`PENDING`、`RUNNING`、`PASSED`、`FAILED`、`ERROR`、`CANCELLED`。`FAILED` 表示发现规则问题；`ERROR` 表示检查本身未可靠完成，是否可重试由 `retryable` 表达，两者不可混淆。

### 5.5 PermissionDeclaration

```text
id
submission_version_id
permission_id
phase                    INSTALL | RUNTIME
access                   READ | WRITE | EXECUTE | CONTROL | SEND
scope                    WORKSPACE | USER_SELECTED | SYSTEM | CREDENTIALS | BROWSER | NETWORK
targets_json             域名、路径类别、命令类别等规范化目标
purpose
required
data_categories_json
retention?
created_at
```

声明是作者承诺，不是技术沙箱。Security Analysis 需要把“声明”与“观察到的能力”分开显示。

首版权限词汇沿用并扩展现有共享 vocabulary：

- File Read / File Write；
- Network Access；
- Subprocess / Shell Execution；
- Credentials / Environment Secrets；
- Browser Control；
- Install Script；
- Telemetry；
- Native Binary / Downloaded Executable（未来新增候选）。

### 5.6 RiskAssessment

```text
id
submission_version_id
level                    LOW | MEDIUM | HIGH | CRITICAL
ruleset_version
factor_summary_json
derived_from_check_runs
assessed_at
manual_override_from?
manual_override_reason?
reviewer_user_id?
```

每次规则集或候选变化生成新记录，不改写旧结论。人工覆盖必须公开原级别、新级别、理由和审核人；不能覆盖来源摘要不一致、无授权或确认恶意代码等硬性不变量。

### 5.7 ReviewDecision / SubmissionAppeal

```text
ReviewDecision
  id, submission_version_id, reviewer_user_id,
  decision, reason_codes, explanation_public,
  evidence_private_ref?, policy_version, created_at

SubmissionAppeal
  id, submission_id, publication_id?, appellant_user_id,
  decision_id, statement, status,
  resolver_user_id?, response_public?, created_at, resolved_at?
```

- `decision`：`APPROVE`、`REQUEST_CHANGES`、`REJECT`、`SUSPEND`、`RESTORE`、`DELIST`；
- public explanation 必须说明事实、命中规则、可修复动作和申诉方式；
- 私密漏洞细节可延迟披露，但不能只显示“内部原因”；
- 申诉尽量由非原决定人处理，高影响决定需要双人复核。

### 5.8 RegistryPublication

```text
id
submission_version_id
plugin_id
plugin_version_id
initial_snapshot_id
status                   ACTIVE | SUSPENDED | DEPRECATED | DELISTED
published_at
suspended_at?
status_reason_code?
created_at
updated_at
```

它明确证明“哪个 SubmissionVersion 产生了哪个 Registry PluginVersion/Snapshot”，同时把发布后治理与 Submission 审核分开。

## 6. 四类检查边界

### 6.1 Source Verification

确认：

- 提交者对来源有可验证控制权；
- GitHub repository numeric ID、owner numeric ID/type、canonical URL 一致；
- branch/tag 已解析为 commit SHA；
- npm package name、精确 version、integrity、repository metadata 与 GitHub 身份一致；
- 抓取时间和最小化 Evidence 已保存。

不确认：插件安全、兼容、许可证法律结论或代码质量。

硬失败：来源身份冲突、摘要变化、无控制权、引用不可固定。临时 API 故障只能重试，不能记为开发者违规。

### 6.2 Metadata Checking

确认：

- Schema、名称、说明、分类、版本和必填披露完整；
- 许可证字段存在且 SPDX/来源信息可解析；
- 权限、安装脚本、外部服务、遥测、原生载荷已声明；
- 文案没有明显冒充 HarnessHub/DeepSeek 官方身份。

不对版权归属或安全做最终保证。

### 6.3 Compatibility Check

确认：

- DSH Bundle/patch 清单可由锁定版本的适配器解析；
- 声明的 DSH 范围与实际检查基线一致；
- 入口文件和必要制品存在；
- 测试结果标明 OS、Node、DSH 和工具版本。

`DECLARED`、`PARSED`、`TESTED` 必须是不同展示状态。测试通过不等于所有环境兼容。

### 6.4 Security Analysis

确认有限范围内的信号：

- 声明权限与观察到的 API/脚本/依赖是否一致；
- install/prepare/postinstall、Shell、子进程、下载执行；
- 文件、凭证、浏览器、网络和遥测能力；
- 原生二进制、混淆、动态执行和可疑载荷；
- 依赖与发布制品是否与审核来源一致。

输出必须说明检查对象摘要、工具/规则版本、检查时间、发现和未覆盖范围。没有 Finding 不得显示为“安全认证”。

### 6.5 Human Review

适用于：

- HIGH/CRITICAL 风险；
- 自动检查无法解释的冲突或误报；
- 原生二进制、混淆、凭证、广泛文件/网络、动态下载；
- 身份冒充、版权、争议内容和政策例外；
- 人工 Risk override、紧急暂停、恢复和下架。

人工审核不能跳过稳定来源、不可变摘要，以及有效 Ownership 或新插件的 submission-scoped source control evidence 这些硬性安全门槛。

## 7. 风险等级与路由

风险等级描述潜在影响和所需审核深度，不是“好/坏”或允许/禁止等级。

| 等级 | 典型信号 | 默认路由 |
|---|---|---|
| `LOW` | 纯格式化/UI、无外网、无写入、无子进程 | 自动检查通过后进入快速发布候选 |
| `MEDIUM` | 限定域名网络、用户选择范围内读写、可关闭遥测 | 自动检查 + 风险说明；抽样或规则触发复核 |
| `HIGH` | Shell/子进程、安装脚本、浏览器控制、广泛文件访问、凭证使用 | 强制人工审核和安装前强化确认 |
| `CRITICAL` | 下载后执行、隐蔽持久化、来源/制品不一致、确认窃密或绕过授权 | 禁止自动发布；安全复核，确认恶意时拒绝或暂停 |

示例因子：

- Network：固定、披露的 API 与任意目的地不同；
- File：用户选择文件、workspace、home/system 范围不同；
- Shell：固定参数的受限子进程与任意命令执行不同；
- Build script：可复现构建与下载执行动态代码不同；
- Credentials：明确服务凭据与遍历环境变量/密钥目录不同；
- Browser：读取当前页面与读取 Cookie/跨站自动操作不同。

高风险插件可以发布，但需要更强 Evidence、审核和用户确认。确认恶意、来源不可固定或故意隐瞒关键能力不是“高风险可接受”，而是独立的拒绝条件。

## 8. 透明审核与申诉

每个对开发者可见的检查或决定至少包含：

- 当前状态和发生时间；
- reason code 与适用政策版本；
- 检查的是哪个 SubmissionVersion/摘要；
- 可公开的 Evidence 摘要；
- 开发者可以如何修复或补充；
- 是否可重试、重交或申诉；
- 人工覆盖是否发生。

状态页面不得只显示 “Rejected by policy” 或不可解释的综合分数。为防止泄露检测规则或漏洞利用细节，可以延迟部分证据，但必须给出足以行动的分类、影响和处理路径。

## 9. 发布事务与现有 Registry 集成

### 9.1 发布前不变量

- SubmissionVersion 已冻结并处于 `APPROVED`；
- 来源 commit/package/integrity 与批准 Evidence 完全一致；
- Source、Compatibility、Security 必需 CheckRun 已完成；
- 需要的人工决定存在且绑定相同 revision；
- submitter 的 Ownership/来源控制权仍有效；
- version identity 未被其他 PluginVersion 占用。

### 9.2 发布事务

在一个幂等数据库事务中：

1. 对 NEW_PLUGIN 创建非冲突 Plugin ID；对 NEW_VERSION 锁定并确认现有 Plugin；
2. 创建不可变 PluginVersion，identity key 来自精确来源；
3. 创建包含批准元数据、权限声明、风险摘要和 Source Evidence 引用的首个 PluginSnapshot；
4. 更新 PluginSource 的当前可用状态，但不覆盖历史 Evidence；
5. 对首个新插件创建 PluginOwnership；
6. 创建 RegistryPublication 并把状态设为 ACTIVE；
7. 将 Submission 标为 PUBLISHED，记录 Audit Event。

任何一步失败全部回滚；重试使用 idempotency key，不产生重复 PluginVersion 或 Ownership。

### 9.3 后续同步

Registry 同步仍遵守 Phase 1：相同 identity 复用 PluginVersion 并追加 Snapshot。若上游当前内容与已发布 identity 不一致，标记来源异常，不能静默修改已发布版本。

## 10. 未来 API 草案

以下只是契约方向，不在 Phase 3-A 实现：

```text
POST   /submissions
GET    /submissions/:id
GET    /developer/submissions
PATCH  /submissions/:id/draft
POST   /submissions/:id/submit
POST   /submissions/:id/versions
POST   /submissions/:id/withdraw

GET    /submissions/:id/checks
GET    /submissions/:id/findings
GET    /submissions/:id/decisions
POST   /submissions/:id/appeals

GET    /plugins/:id/publications
```

安全要求：

- 所有写操作从服务端 Session 解析 actor，不接受 body 中的 user/role/badge；
- Cookie 写请求做 CSRF/Origin 防护，Desktop 使用 opaque Bearer Session；
- Draft PATCH 使用 `If-Match`/lock version；提交、发布、撤回使用 idempotency key；
- 上传 URL 不直接触发服务端任意抓取，来源必须经过 provider adapter 的 URL、DNS/IP 和大小限制；
- Reviewer API 位于独立权限域，并要求 Reviewer Role、最小 scope、recent-auth 和 Audit Event；
- 普通 Reviewer 不得授予 Ownership、Role 或 Badge。

## 11. 数据保留与隐私

- 保存审核所需的精确摘要、最小 Evidence、决定与审计；
- 不保存 GitHub/npm token、Cookie、无关 provider metadata 或本机路径；
- 私有安全 Evidence 与公开解释分离，并限制访问；
- Withdrawal、Rejection、Suspension 不删除已用于安全、争议和审计的记录；
- 具体保留期限须在托管地区和法律基线确认后落地自动清理策略。

## 12. Phase 3-A 明确不实现

- Prisma migration 或生产数据表；
- 上传/提交 UI；
- 自动扫描 Worker；
- Reviewer 后台；
- Desktop Installation；
- 评论、评分、推荐、支付或 Bounty。

## 13. 进入实现前的决策门槛

未来开始 Submission 实现前必须确认：

1. 新插件 slug/ID 冲突与保留名称策略；
2. 首发是否允许 GitHub-only，npm 是否必须同时存在；
3. LOW/MEDIUM 自动发布是否启用，还是内测期全部人工最终批准；
4. Reviewer 负责人、响应时限、回避和申诉复核规则；
5. 扫描 Worker 的隔离、出网、制品大小和超时策略；
6. 许可证/版权投诉的法律负责人和保留期限；
7. DSH 支持基线及 compatibility contract test；
8. Publication suspension 对未来 Desktop 安装、更新和安全通知的精确影响。

在这些门槛确认前不能开放自动公开发布。Phase 3-B 已独立完成 Installation Security Architecture；下一步评估 Phase 3-C Prototype 时，仍不得以实现 Desktop 安装为理由绕过 Submission 的不可变发布与审核门槛。
