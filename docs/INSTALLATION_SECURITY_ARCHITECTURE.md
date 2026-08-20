# Installation Security Architecture

状态：Phase 3-B 架构设计完成，尚未实现安装器、系统探测、Shell 执行、DSH 部署或用户环境修改

## 1. 目标与边界

Installation Security 负责把一个已发布、不可变的 Registry PluginVersion 转换成用户能够理解、明确确认、可验证和尽可能可恢复的本机操作。

核心原则：

- 先解析、分析和展示，后执行；
- 用户确认绑定精确版本、目标 Profile、权限、风险和执行计划摘要；
- 高风险能力单独说明，不通过默认勾选或笼统同意静默授权；
- 安装、更新和卸载共享事务、日志、验证与恢复模型；
- 服务端提供事实和策略，不向 Desktop 下发任意命令；
- 本机安装历史和详细日志默认只保存在本机；
- 不把“命令返回成功”写成“插件安全”或“安装完全正确”；
- 只承诺实际能够恢复的范围，不虚构完整回滚能力。

本阶段只定义接口和状态，不读取或修改用户的 DSH、Node、pnpm、Profile、文件或系统设置。

## 2. 信任边界与主要威胁

```text
Registry Publication + immutable PluginVersion/Snapshot
  -> versioned Installation Manifest
  -> HarnessHub Desktop
       -> Environment Manager (read-only probe)
       -> Risk Evaluator
       -> Permission & Change Review
       -> User Confirmation bound to plan digest
       -> Installation Transaction
            -> DSH Adapter
            -> Platform Adapter
       -> Post-operation Verification
       -> Local Installation Record / Recovery Journal
```

主要威胁：

- 恶意深链注入 package spec、Profile 名称、路径或命令；
- Registry 页面展示的版本与 Desktop 实际安装对象不一致；
- 用户确认后，tag、branch、制品、权限或计划发生变化；
- Shell 参数拼接、路径穿越、符号链接和不安全临时目录；
- 两个安装事务同时修改同一 DSH Profile；
- 断电、进程崩溃或磁盘不足留下半完成状态；
- 安装脚本在 Agent 沙箱之外读取凭据、访问网络或产生不可逆副作用；
- 更新新增权限但沿用旧确认；
- 卸载误删共享依赖、用户数据或非 HarnessHub 管理的文件；
- 服务端暂停版本后，客户端仍从缓存执行新安装；
- 日志或诊断包泄露 token、环境变量、用户名或本机路径。

## 3. 组件职责

### 3.1 Registry/API

提供：

- Plugin、PluginVersion、Snapshot 和 Publication 状态；
- 精确 GitHub commit、npm version、integrity 和来源 Evidence；
- Submission RiskAssessment、PermissionDeclaration、检查时间和覆盖范围；
- 版本化 Installation Manifest；
- 暂停、下架、兼容性 kill switch 和最低 Desktop/Adapter 版本策略。

不提供：

- 任意可执行 Shell 字符串；
- 用户本机绝对路径；
- 自动提权指令；
- 绕过用户确认的远程执行或静默卸载命令。

### 3.2 HarnessHub Desktop

负责：

- 只接收 Plugin/PluginVersion 等稳定 ID；
- 从可信 API 重新获取 Manifest，拒绝深链中的命令和 package spec；
- 本机只读探测、计划生成、风险提升、权限展示和用户确认；
- 串行执行本机事务、验证结果、回滚或生成恢复指引；
- 保存最小化本机安装记录。

### 3.3 Environment Manager

统一调用 DSH 与 Platform Adapter，产生规范化的只读 `EnvironmentSnapshot`，不让 UI 解析命令输出或平台路径。

### 3.4 DSH Adapter

唯一理解 DSH Bundle、Profile、CLI、`--dump-config`、重启要求和版本差异的组件。业务层不能拼接 DSH 命令。

### 3.5 Platform Adapter

封装 OS/architecture/runtime 探测、安全进程启动、文件锁、原子文件操作、路径规范化和受管临时目录。它不决定产品风险或用户文案。

## 4. Installation Manifest

Desktop 不直接把 Registry Plugin 对象当作执行计划。未来 API 应提供版本化、可验证的 Manifest：

```text
InstallationManifest
  schema_version
  manifest_id
  plugin_id
  plugin_version_id
  publication_id
  publication_status
  source_provider
  immutable_source_ref
  artifact_integrity?
  snapshot_id
  submission_risk_assessment_id
  permission_declaration_digest
  compatibility_constraints
  requires_install_time_code
  minimum_desktop_version
  minimum_dsh_adapter_version
  issued_at
  expires_at
  signature / authenticity_proof
```

安全规则：

- Manifest 只引用固定 commit、精确 package version 和 integrity，不接受 branch、tag 或 `latest` 作为执行身份；
- Desktop 校验 Schema、时效、服务端真实性和所有引用关系；
- Manifest 过期、Publication 非 ACTIVE、摘要不一致或客户端/Adapter 太旧时重新获取并重新分析；
- Manifest 只描述目标，不包含 Shell 命令；本机计划由受版本控制的 DSH Adapter 生成；
- 签名格式、密钥轮换和离线策略必须在 Prototype 前独立确认；未完成时不得宣称支持可信离线安装。

## 5. 操作状态机

安装、更新和卸载使用同一个 `InstallationTransaction`，通过 `operation_kind` 区分。

```text
REQUESTED
  -> RESOLVING
  -> ANALYZING
  -> PERMISSION_REVIEW
  -> AWAITING_CONFIRMATION
  -> CONFIRMED
  -> PREPARING
  -> APPLYING
  -> VERIFYING
  -> COMMITTING
  -> INSTALLED | UPDATED | UNINSTALLED

Before APPLYING:
  -> CANCELLED
  -> BLOCKED
  -> FAILED

From PREPARING / APPLYING / VERIFYING / COMMITTING:
  -> ROLLING_BACK
       -> ROLLED_BACK
       -> RECOVERY_REQUIRED

Unexpected interruption:
  -> INTERRUPTED
       -> RESUMING_ANALYSIS
            -> ROLLING_BACK | VERIFYING | RECOVERY_REQUIRED
```

### 5.1 状态定义

| 状态 | 明确含义 | 是否允许本机变更 |
|---|---|---|
| `REQUESTED` | 用户请求某个稳定 PluginVersion 和操作类型 | 否 |
| `RESOLVING` | 重新获取并验证 Manifest、Publication 与不可变来源 | 否 |
| `ANALYZING` | 只读探测环境，生成步骤、差异、风险与回滚覆盖度 | 否 |
| `PERMISSION_REVIEW` | 展示权限、原因、范围、安装期/运行期和版本差异 | 否 |
| `AWAITING_CONFIRMATION` | 等待用户对精确 plan digest 作决定 | 否 |
| `CONFIRMED` | 已生成短时、单次使用的 ConsentRecord | 否 |
| `PREPARING` | 获取 Profile 锁、检查磁盘、创建 Recovery Journal 和受管备份 | 仅受管备份/日志 |
| `APPLYING` | DSH Adapter 按确认计划执行唯一被允许的变更 | 是 |
| `VERIFYING` | 比较前后 Profile/Bundle/配置事实并运行非启动型验证 | 只允许验证所需读取 |
| `COMMITTING` | 持久化本机安装记录并安全清理临时资源 | 仅受管记录 |
| `INSTALLED` | 指定版本首次安装完成且达到声明的验证标准 | 终态 |
| `UPDATED` | 从记录的旧版本更新到指定版本并验证完成 | 终态 |
| `UNINSTALLED` | 受管插件引用已移除并验证；保留数据按用户选择处理 | 终态 |
| `CANCELLED` | 用户在产生目标环境变更前取消 | 终态，无需回滚 |
| `BLOCKED` | 命中安全/兼容硬阻断，未产生目标环境变更 | 终态，可在条件改变后新建事务 |
| `FAILED` | 在产生目标环境变更前失败，或确认无变更后失败 | 终态 |
| `ROLLING_BACK` | 正在按已记录 Recovery Plan 恢复可恢复部分 | 是 |
| `ROLLED_BACK` | 已恢复到事务前可验证状态 | 终态，不等于撤销外部副作用 |
| `RECOVERY_REQUIRED` | 无法证明已恢复，需要用户可理解的人工步骤 | 终态，必须醒目展示 |
| `INTERRUPTED` | 上次事务未记录正常终态 | 临时状态；启动时优先恢复分析 |
| `RESUMING_ANALYSIS` | 根据 Journal 判断继续验证、回滚或人工恢复 | 只读，直到选择恢复动作 |

### 5.2 转换不变量

- 同一 DSH Profile 同一时间最多一个变更事务；
- 只有与当前 `plan_digest` 完全一致且未过期的 ConsentRecord 可以进入 `PREPARING`；
- 用户在 `APPLYING` 后点击停止，不直接变成 `CANCELLED`，而是进入安全停止点后回滚；
- 任一摘要、Publication、权限或环境关键事实变化都使确认失效，回到 `ANALYZING`；
- `INSTALLED/UPDATED/UNINSTALLED` 必须有验证 Evidence，不能只看进程退出码；
- `ROLLED_BACK` 只有在事务前快照与恢复后事实满足同一验证规则时才能写入；
- 无法证明恢复时必须使用 `RECOVERY_REQUIRED`，不能把错误隐藏为成功。

## 6. 安装记录状态

操作事务是一次历史事件；本机插件当前状态单独保存：

```text
LocalInstallation
  plugin_id
  plugin_version_id
  target_profile_id
  status              INSTALLED | DEGRADED | UNKNOWN | REMOVAL_PENDING
  manifest_id
  installed_source_ref
  permission_digest
  risk_level_at_confirmation
  installed_at
  last_verified_at
  last_transaction_id
```

- `DEGRADED`：插件仍在 Profile 中，但验证、兼容或依赖状态异常；
- `UNKNOWN`：外部工具或用户改动使 HarnessHub 无法可靠判断；不得静默覆盖；
- 上游 SUSPENDED 不会偷偷改成本机未安装，也不会远程卸载；Desktop 只显示安全警告并阻止新的安装/更新，等待明确处置策略。

## 7. 权限模型

### 7.1 用户可见能力

普通用户看到平台控制的本地化能力名称，而不是包管理器参数或 API 名称：

| 用户看到 | 应解释的范围示例 |
|---|---|
| 网络访问 | 固定服务域名、任意互联网、仅安装期间或运行期间 |
| 读取项目文件 | 当前选择的项目/Profile，不写成“filesystem-read” |
| 修改项目文件 | 可能修改哪些类别的工作区文件 |
| 访问其他文件 | 用户单独选择的目录，或更广的用户目录范围 |
| 执行命令 | 固定工具类别还是可执行任意命令 |
| 执行安装代码 | 安装时会运行第三方构建/安装脚本，且发生在 Agent 沙箱之外 |
| 控制浏览器 | 读取页面、自动点击/输入、是否涉及会话数据 |
| 读取环境与凭据 | 配置变量、服务 token 或其他敏感信息，分别说明 |
| 后台运行 | 是否启动长期进程、何时停止 |
| 发送使用数据 | 数据类别、目的地、用途和关闭方式 |
| 使用原生程序 | 是否包含或运行平台相关二进制 |

技术词 `allowBuilds=true`、生命周期脚本名、CLI flags 可以放在“开发者详情”，不能替代面向普通用户的说明。

### 7.2 内部能力记录

```text
PermissionCapability
  permission_id
  phase                 INSTALL | RUNTIME
  action                READ | WRITE | EXECUTE | CONTROL | SEND | PERSIST
  scope                 PROFILE | WORKSPACE | USER_SELECTED | USER_HOME | SYSTEM |
                        NETWORK | BROWSER | ENVIRONMENT | CREDENTIALS
  targets               规范化域名、路径类别、命令类别或数据类别
  required
  reason_code
  developer_reason?
  source                DECLARED | OBSERVED | INFERRED
  risk_level
  enforcement           DISCLOSURE_ONLY | USER_SCOPED | DSH_ENFORCED | OS_ENFORCED
  revocable
```

规则：

- `reason_code` 对应平台本地化解释；`developer_reason` 明确标为作者说明，不能冒充平台结论；
- `DECLARED`、`OBSERVED`、`INFERRED` 分开显示；未观察到不代表没有能力；
- `enforcement = DISCLOSURE_ONLY` 时必须写明这是一项披露，而不是操作系统强制隔离；
- 安装期和运行期分开，避免把一次安装脚本授权误当作永久运行权限；
- 用户选择的路径只在确认时保存规范化引用，不进入服务端；
- 权限词汇由共享 Schema 和 i18n 管理，插件不能自定义一个看似低风险的权限名称掩盖高风险行为。

### 7.3 权限差异

更新必须展示：

- 新增、扩大和移除的能力；
- 访问范围变化，例如固定域名变为任意网络；
- 从运行期声明变为安装期执行；
- 新增安装脚本、原生程序、遥测或凭据访问；
- RiskAssessment 与检查时间变化。

新增或扩大的权限使旧确认失效。减少权限仍需展示，但可以使用更紧凑的确认体验。

## 8. 风险集成

### 8.1 两层风险

```text
Submission RiskAssessment (version-level, server evidence)
  + Installation Context (local environment and requested operation)
  + Permission / version delta
  + Compatibility and Publication state
  -> InstallationRiskAssessment
  -> confirmation depth or hard block
```

Submission Risk 是当前发布版本的审核基线。Desktop 不能自行降低它；本机环境、更新差异和操作计划可以提升风险。只有 Registry 中新的、可追溯 RiskAssessment 才能改变服务器基线。

```text
InstallationRiskAssessment
  plugin_version_id
  submission_risk_assessment_id
  environment_snapshot_id
  operation_kind
  effective_level       LOW | MEDIUM | HIGH | CRITICAL
  factors
  hard_blocks
  warnings
  required_confirmations
  assessed_at
  evaluator_version
```

### 8.2 本机提升因子

- 当前 OS/architecture/runtime 不在测试矩阵；
- DSH/Node/pnpm 版本超出声明范围；
- 更新新增或扩大权限；
- 目标 Profile 含冲突 Bundle 或不可解释的外部改动；
- 安装计划需要第三方脚本、原生程序、凭据或广泛网络/文件能力；
- 计划的回滚覆盖度为 PARTIAL/NONE；
- Publication、来源可用状态或检查结果接近过期；
- 现有版本处于 DEGRADED/UNKNOWN，无法可靠计算差异。

### 8.3 风险路由

| 风险 | 默认确认体验 |
|---|---|
| `LOW` | 单页摘要和明确的“安装”按钮；仍不静默执行 |
| `MEDIUM` | 展开权限、范围、变更与风险原因后确认 |
| `HIGH` | 分步确认；安装期代码、Shell、凭据等能力单独确认；强化恢复提示 |
| `CRITICAL` | 默认 BLOCKED；仅当 Registry 有明确、时限化的安全决定允许安装时，才进入最高强度确认，用户点击本身不能覆盖硬阻断 |

风险不是开发者信誉分，也不是安全保证。高风险能力可以有正当用途；确认恶意、摘要不一致或无可信来源是独立阻断条件。

### 8.4 硬阻断与警告

硬阻断不能由普通“继续安装”覆盖：

- Publication 为 SUSPENDED/DELISTED 或版本不存在；
- Manifest 来源真实性、Schema、时效或引用关系校验失败；
- commit/package/integrity 与 Snapshot 不一致；
- 版本含未经 Submission 审核的新增权限或安装脚本；
- Desktop/DSH Adapter 版本不足以安全解释计划；
- DSH/runtime 明确不兼容；
- 目标路径不安全、Profile 无法锁定或存在未恢复事务；
- 确认摘要已经过期或与计划不一致；
- CRITICAL 没有允许安装的有效安全决定。

可解决警告会说明解决方法，例如选择其他 Profile、升级兼容 Runtime、关闭冲突进程或等待来源恢复。临时 API 错误不是“插件恶意”。

## 9. 用户确认体验

### 9.1 普通模式

确认页按用户决策顺序展示：

```text
安装 Browser Agent 1.2.0

安装位置
  DSH Profile：Work

此插件需要
  ✓ 访问 api.example.com
     原因：调用插件提供的搜索服务
  ✓ 读取当前项目文件
     原因：分析你选择的项目内容
  ⚠ 安装时执行第三方代码
     原因：构建插件运行文件
     说明：这一步发生在 Agent 沙箱之外

风险：高
  因为包含安装脚本和项目文件读取

恢复能力：部分
  HarnessHub 可以恢复 Profile 和受管文件，无法保证撤销脚本已经发出的网络请求。

[查看将发生的变化]
[取消]
[继续]
```

要求：

- 主按钮写具体动作，如“安装 1.2.0”，不写模糊的“同意”；
- 默认不折叠 HIGH/CRITICAL 原因；不使用预勾选；
- 取消与继续同等可见，不用倒计时、颜色诱导或阻碍返回；
- 权限名称与平台解释本地化，插件名称、作者说明和 README 保持原文；
- 屏幕阅读器、键盘操作、缩放和高对比度必须进入实现验收；
- 普通模式不显示 CLI、`allowBuilds`、JSON、内部 reason ID；开发者详情可查看精确来源和计划。

### 9.2 高风险分步确认

HIGH 操作至少分为：

1. 版本、来源、Profile 和变更摘要；
2. 权限与范围；
3. 安装期代码/凭据/广泛访问的单独确认；
4. 回滚覆盖度与失败恢复说明；
5. 最终具体动作。

不能要求用户输入机械短语来制造“已理解”的假象。需要更强保障时优先使用系统级本机身份确认和清晰的逐项选择，具体方案留待 Prototype 决策。

### 9.3 ConsentRecord

```text
ConsentRecord
  id
  transaction_id
  plugin_version_id
  target_profile_id
  operation_kind
  installation_plan_digest
  permission_digest
  environment_snapshot_id
  effective_risk_level
  separately_confirmed_capabilities
  created_at
  expires_at
  consumed_at?
```

- 单次使用、短时有效；
- 只保存在本机；
- 任何版本、权限、风险、Profile、步骤或关键环境变化都必须重新确认；
- 不允许“永远允许此开发者所有插件”或跨版本继承高风险确认；
- DSH Setup 与插件安装使用不同 ConsentRecord，不能捆绑。

## 10. Installation Transaction

### 10.1 概念模型

```text
InstallationTransaction
  id
  idempotency_key
  operation_kind          INSTALL | UPDATE | UNINSTALL | REPAIR
  plugin_id
  from_plugin_version_id?
  to_plugin_version_id?
  target_profile_id
  manifest_id
  installation_plan_id
  consent_record_id?
  environment_snapshot_id
  status
  current_step
  rollback_coverage       FULL | PARTIAL | NONE
  started_at?
  finished_at?
  error_code?
  error_summary_redacted?
  recovery_journal_ref

InstallationStep
  id
  transaction_id
  sequence
  kind
  expected_precondition_digest
  expected_postcondition_digest
  status
  started_at?
  finished_at?
  error_code?

RecoveryJournal
  transaction_id
  before_environment_digest
  before_profile_snapshot
  previous_plugin_version?
  managed_files_created
  managed_files_replaced
  package_lock_backup_ref?
  reversible_steps
  irreversible_side_effect_warnings
  recovery_instructions
  journal_version
```

这些是本机概念模型，不代表必须同步到服务器。具体使用 SQLite、受保护文件 Journal 或组合方案，在 Prototype 前以崩溃一致性测试决定。

### 10.2 事务阶段

1. 获取 Profile 级互斥锁；
2. 重新验证 Manifest、Publication、计划和 ConsentRecord；
3. 检查磁盘、目录权限、运行中的 DSH 和冲突事务；
4. 将事务与 Recovery Journal 持久化并确保可恢复读取；
5. 捕获 Profile/Bundle/lockfile 的事务前事实；
6. 在受管 staging 区准备可验证制品；
7. 由 DSH Adapter 以程序 + 参数数组执行确认过的步骤；
8. 验证 Profile、Bundle、版本、配置 dump 和预期差异；
9. 写入 LocalInstallation 和终态；
10. 仅在终态持久化后清理临时资源并释放锁。

事务不能尝试把任意外部程序的所有行为封装成数据库式原子性。它的目标是防止 HarnessHub 管理的状态静默半完成，并明确剩余风险。

### 10.3 回滚覆盖度

| 覆盖度 | 含义 |
|---|---|
| `FULL` | 对 HarnessHub/DSH 受管状态有验证过的反向操作，且没有已知外部副作用 |
| `PARTIAL` | 可恢复 Profile、lockfile 和受管文件，但脚本、网络或外部服务副作用无法保证撤销 |
| `NONE` | 无可靠自动恢复路径；默认应 BLOCKED，除非有明确高风险策略和人工恢复方案 |

常见不可可靠回滚内容：

- 安装脚本已发送的网络请求；
- 脚本修改的未知用户文件；
- 外部服务创建的资源；
- 泄露或读取过的凭据；
- 任意后台进程产生的独立状态。

这些内容必须在确认前展示，不能等失败后才说明。

### 10.4 错误与诊断

- 使用稳定的错误码和面向用户的解决步骤，不展示调用栈；
- 日志按字段脱敏 token、Cookie、Authorization、环境变量值、用户目录和命令输出；
- 原始输出限制大小，默认仅本机短期保存；
- 用户主动导出诊断前必须预览将包含的字段；
- 服务端不能要求上传完整 Profile、源码或日志才能获得基本恢复指引。

## 11. 安装、更新、卸载语义

### 11.1 安装

- 只能安装 ACTIVE Publication 的精确 PluginVersion；
- 用户明确选择目标 Profile；默认不替用户创建或切换 Profile；
- 若需要 DSH/Runtime Setup，先结束当前分析并进入独立 Setup Assistant 流程；Setup 完成后重新生成安装计划和确认。

### 11.2 更新

- 从 LocalInstallation 和实际 Profile 双向读取当前状态，冲突时标记 UNKNOWN；
- 展示版本、来源、依赖、权限、风险、安装脚本和兼容性差异；
- 保存可恢复的旧版本引用和事务前快照；
- 更新完成后不得自动删除仍用于回滚的旧制品，按明确保留策略清理；
- 新权限或风险提升禁止沿用旧确认。

### 11.3 卸载

- 只移除由该安装记录明确管理的 Bundle 引用和受管制品；
- 共享依赖、其他 Bundle、用户文件和外部创建资源不得按猜测删除；
- 插件数据、缓存和配置采用单独选择：“保留数据”默认优先；
- 检测依赖者和运行中的 Profile，必要时 BLOCKED 或请求先停止；
- 卸载验证确认 Bundle 不再生效，同时保留必要的审计和恢复记录；
- HarnessHub 不因服务端 kill switch 静默卸载本机插件。

### 11.4 Repair

Repair 不是“强制重装”。它先比较 LocalInstallation 与实际 Profile，展示将恢复的具体事实，然后生成新的 Plan 与 ConsentRecord。未知用户改动不能被静默覆盖。

## 12. 跨平台架构

```text
HarnessHub Desktop
  -> Environment Manager
       -> DSH Adapter
       -> Platform Adapter
            |- macOS Adapter
            |- Windows Adapter
            `- Linux Adapter
```

### 12.1 EnvironmentSnapshot

```text
EnvironmentSnapshot
  id
  os_family
  os_version
  architecture
  libc_variant?
  desktop_version
  dsh_adapter_version
  dsh_presence / version
  node_presence / version / architecture
  package_manager_presence / version
  available_profiles (opaque local IDs + display labels)
  selected_profile_state_digest?
  filesystem_capabilities
  process_lock_state
  free_space_class
  captured_at
```

Snapshot 保存决策所需的最小事实。绝对路径、用户名、环境变量值和完整进程列表不上传服务器。

### 12.2 PlatformAdapter 接口方向

```text
PlatformAdapter
  probePlatform()
  normalizeAndValidatePath(candidate, allowedRoot)
  createManagedTempDirectory()
  acquireProfileLock(profileId)
  spawnProgram(programId, args[], environmentAllowlist)
  atomicReplace(managedFile, stagedFile)
  inspectProcessState(processId)
  removeManagedTemporaryFile(fileId)
```

- `programId` 从本机受信程序解析器获取，不能来自远端字符串；
- 参数使用数组，禁止 Shell 字符串拼接；
- 子进程环境使用 allowlist，不继承全部凭据；
- 临时目录权限、符号链接、junction/reparse point 和路径大小写按平台处理；
- 不自动请求管理员/root 权限。需要提升权限时必须成为独立、高可见度的未来设计决定。
- 临时文件删除不表述为物理介质上的“安全擦除”；敏感内容首先不应写入临时文件。

### 12.3 平台关注点

#### macOS

- 区分 Apple Silicon/Intel 与 Rosetta 情况；
- 处理应用签名、公证、Gatekeeper/quarantine 和标准用户目录；
- 不借助 shell profile 注入 PATH；
- 使用平台安全临时目录和文件权限。

#### Windows

- 区分 x64/ARM64、路径大小写、长路径、文件占用和重启后删除；
- 防止 junction/reparse point 跳出允许目录；
- 不把 PowerShell/CMD 字符串作为默认执行层；
- 不自动触发 UAC 或修改系统级 PATH/Registry。

#### Linux

- 识别 architecture、glibc/musl、发行版差异和只读/沙箱化环境；
- 不假设 systemd、sudo、bash 或统一包管理器存在；
- 不自动写 shell profile、系统目录或全局包目录；
- 明确当前支持矩阵，未知组合使用 BLOCKED/unsupported，而不是试错执行。

平台支持由 capability matrix 决定，不以“理论上 Node 能运行”声明支持。

## 13. DSH Adapter 与 Setup Assistant 预留

### 13.1 DSH Adapter

```text
DSHAdapter
  detect(environment) -> DSHDetection
  inspectProfiles() -> ProfileSummary[]
  inspectProfile(profileId) -> ProfileSnapshot
  resolvePluginPlan(manifest, profileSnapshot, operationKind) -> InstallationPlan
  validatePlan(plan) -> PlanValidation
  applyStep(step, executionContext) -> StepResult        [未来实现]
  verifyOperation(plan, before, after) -> VerificationResult
  recoveryPlan(transaction, journal) -> RecoveryPlan
```

要求：

- 每个 Adapter 绑定明确 DSH 版本范围和契约测试；
- CLI 文本只在 Adapter 内解析，向业务层返回稳定错误码和领域对象；
- DSH 预览版行为变化必须先使 contract test 失败，再更新 Adapter；
- `--dump-config` 等验证是有限信号，不能启动插件处理真实用户数据；
- 添加/更新/移除后需要重启 Profile 时只提示并请求用户操作，不静默终止 Agent 会话。

### 13.2 Setup Assistant

```text
Environment Manager
  -> DSH Adapter.detect()
  -> Setup Assistant
       -> SetupAssessment
       -> SetupPlan
       -> User Confirmation
       -> future SetupTransaction
```

未来接口：

```text
SetupAssistant
  assess(environment) -> SetupAssessment
  planDshSetup(targetVersion, environment) -> SetupPlan
  planRuntimeSetup(requirements, environment) -> SetupPlan
  verifySetup(plan) -> SetupVerification
```

安全边界：

- DSH Setup 与插件安装是两个事务、两个确认和两份恢复记录；
- SetupPlan 固定官方来源、精确版本、摘要/签名和目标范围；
- 不通过 curl-pipe-shell、远端任意脚本或静默全局包安装实现；
- 不自动修改 PATH、shell profile、系统包管理器、管理员权限或默认 Profile；
- 用户可以选择平台官方/手动安装指引；完成后重新探测，不假设成功；
- Phase 3-B 不实现或执行任何 Setup 行为。

## 14. 安全原则与强制不变量

1. 深链只携带稳定 ID，绝不携带可执行参数。
2. Desktop 在确认前重新获取并验证 ACTIVE Publication 与不可变 Manifest。
3. 用户确认与 plan/version/profile/permissions/environment digest 绑定，变化后重新确认。
4. 安装期第三方代码永远单独展示和确认，不自动修改 `allowBuilds` 等底层授权配置。
5. 所有进程调用使用固定 program + 参数数组 + 环境 allowlist，不通过 shell 字符串。
6. Profile 级互斥锁和持久 Recovery Journal 必须在第一项目标变更前建立。
7. 所有终态都有可验证含义；不确定就使用 UNKNOWN/RECOVERY_REQUIRED。
8. 卸载只删除明确受管资源，用户数据默认保留。
9. 服务端可以阻止新的安装/更新并提示风险，不能未经用户同意远程执行或卸载。
10. 日志最小化、脱敏、本机优先；诊断上传必须用户主动预览和确认。
11. 风险等级和权限展示不能宣称提供未实现的 OS/DSH 强制隔离。
12. 不支持的 OS/runtime/DSH 组合默认不执行，不能用真实用户环境“试试看”。

## 15. 未来 Desktop/API 接口草案

本节只定义方向：

```text
GET /plugins/:pluginId/versions/:versionId/installation-manifest
GET /publications/:publicationId/status
GET /compatibility/dsh/:version
```

Desktop 本机接口方向：

```text
analyzeOperation(pluginVersionId, profileId, operationKind)
confirmOperation(transactionId, planDigest, selectedOptions)
executeConfirmedOperation(transactionId)
cancelOperation(transactionId)
recoverTransaction(transactionId, recoveryChoice)
listLocalInstallations()
exportRedactedDiagnostics(transactionId)
```

- `executeConfirmedOperation` 只接受本地 transaction ID，不接受命令、路径或 package spec；
- 分析与执行必须是两个显式阶段；
- UI 进程不能直接启动任意子进程，原生命令层再次校验 transaction/consent/plan；
- 所有 IPC payload 使用严格 Schema、大小限制和 allowlist。

## 16. Prototype 前测试与发布门槛

Phase 3-C 即使只做 Prototype，也必须在隔离的临时 DSH Home/Profile 和无真实凭据环境中运行，并覆盖：

- 每个状态和非法状态转换；
- 深链、IPC、Profile ID、路径和参数的恶意输入与模糊测试；
- symlink/junction/path traversal、大小写和 TOCTOU；
- Manifest 过期、摘要变化、Publication 暂停和 Adapter 版本不足；
- 更新新增权限、风险提升和旧确认重放；
- Profile 锁竞争和多个 Desktop 窗口；
- 每个事务步骤前后的崩溃/断电注入；
- 磁盘不足、文件占用、网络中断和 DSH 非零退出；
- FULL/PARTIAL/NONE 回滚覆盖与 RECOVERY_REQUIRED；
- 卸载共享依赖、用户数据和外部修改保护；
- macOS/Windows/Linux 的明确支持矩阵；
- 日志、诊断包和 UI 错误的秘密/路径脱敏；
- 无网络、拒绝权限、用户取消和重复请求。

Prototype 只使用明确无害的测试 Bundle。不得用真实用户 Profile、生产凭据或不受信插件验证安装器。

## 17. Phase 3-B 明确不实现

- 安装、更新、卸载或 Repair 代码；
- Shell/DSH/pnpm/Node 命令执行；
- 本机环境探测；
- DSH/Runtime Setup；
- 系统权限申请、管理员/root 提权；
- 远程 kill/uninstall；
- 安装遥测上传。

## 18. 进入 Phase 3-C 前必须确认

1. Prototype 首发 OS 与 architecture；
2. 受支持的精确 DSH、Node、pnpm 版本矩阵；
3. 测试 Bundle、临时 DSH Home/Profile 和无凭据隔离方案；
4. Installation Manifest 的真实性证明、签名和密钥轮换；
5. 本机 Journal 存储、权限、加密需求和崩溃一致性方案；
6. 哪些步骤可以声称 FULL rollback，哪些必须标注 PARTIAL/NONE；
7. 是否完全禁止 Prototype 运行安装脚本；建议默认禁止；
8. Platform Adapter 的程序 allowlist 和环境变量 allowlist；
9. SUSPENDED/DELISTED 对已安装版本的通知、更新和修复策略；
10. Prototype 是否只做 Analyze + Mock Apply；建议先做 Analyze/Confirm/Simulated Transaction，不触碰真实 DSH。

完成这些门槛后，Phase 3-C 应先建立“分析—确认—模拟事务—故障恢复”闭环，再评估真实安装执行。
