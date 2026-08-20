# HarnessHub Installation Prototype

状态：Phase 3-C 已实现

更新时间：2026-08-20

## 1. 原型目的

Phase 3-C 验证以下产品和安全闭环能否落地：

```text
Plugin Fixture
  -> Simulation-only Installation Manifest
  -> Analyze
  -> Permission Review
  -> Explicit User Confirmation
  -> Simulated Transaction
  -> Simulated Verification
  -> Installed State / Recovery State
```

这里的 `INSTALLED` 只表示模拟事务到达成功终态，不表示任何插件已经写入电脑、DSH Profile 或包管理器。

## 2. 强制安全范围

本原型不会：

- 执行 Shell、DSH、npm、pnpm、Node 安装命令或第三方代码；
- 下载、解压、构建或加载插件；
- 创建、修改或删除用户文件；
- 修改 PATH、环境变量、系统设置或 DSH Profile；
- 探测真实操作系统、架构、Runtime 或 DSH；
- 请求管理员/root 权限；
- 把模拟事务写入生产 Registry 或服务端数据库。

原型包是纯 TypeScript 内存状态机，不导入 Tauri command、Node child process、文件系统、网络或包管理器 API。Desktop 只渲染状态机结果。

## 3. 实现结构

```text
apps/desktop
  -> InstallationPrototypePanel
       -> Permission Review UI
       -> scenario selection
       -> transaction/audit presentation
  -> packages/installation-prototype
       -> MockInstallationEngine
       -> MockEnvironmentManager
       -> simulation-only fixtures
```

`MockInstallationEngine` 构造时只接受：

```text
simulationOnly = true
executionPolicy = SIMULATION_ONLY
```

`MockEnvironmentManager` 固定返回：

```text
platform = PROTOTYPE
dshExecutionAvailable = false
systemMutationAllowed = false
```

任何实现若把 DSH 执行或系统修改能力标记为可用，会立即失败，而不是降级为隐式执行。

## 4. Installation Manifest Fixture

测试 Fixture 包含：

- 插件稳定 ID 和版本 ID；
- 版本号；
- 可理解权限声明；
- 权限原因和范围；
- 版本风险等级和原因；
- 强制模拟执行策略。

提供两个 Fixture：

1. `Safe Test Agent`：LOW，仅声明网络访问，用于基础状态机测试；
2. `Permission Review Agent`：MEDIUM，声明网络访问、项目文件读取与安装时第三方代码，用于权限确认 UI 测试。

这些内容只存在于 `packages/installation-prototype/src/fixtures.ts`，不会进入生产 Registry。

## 5. 状态机

### 5.1 状态定义

| 状态 | 含义 |
|---|---|
| `REQUESTED` | 已认证用户创建了模拟事务 |
| `ANALYZING` | 正在解析模拟清单、模拟环境和权限 |
| `WAITING_CONFIRMATION` | 已展示权限和风险，等待用户明确选择 |
| `INSTALLING_SIMULATED` | 只记录模拟应用步骤，不执行代码 |
| `VERIFYING` | 只记录模拟验证步骤 |
| `INSTALLED` | 模拟成功终态，不代表真实安装 |
| `CANCELLED` | 用户在确认前取消 |
| `FAILED` | 模拟应用步骤失败 |
| `ROLLING_BACK` | 正在模拟恢复步骤 |
| `ROLLED_BACK` | 模拟恢复成功 |
| `RECOVERY_REQUIRED` | 模拟恢复失败，需要明确人工处理 |

### 5.2 成功路径

```text
REQUESTED -> ANALYZING -> WAITING_CONFIRMATION
          -> INSTALLING_SIMULATED -> VERIFYING -> INSTALLED
```

### 5.3 取消路径

```text
WAITING_CONFIRMATION -> CANCELLED
```

### 5.4 失败与恢复路径

```text
INSTALLING_SIMULATED -> FAILED -> ROLLING_BACK -> ROLLED_BACK
                                             -> RECOVERY_REQUIRED
```

状态转换只能由引擎按允许顺序完成。错误状态、重复确认或跨用户读取都会被拒绝。

## 6. 权限确认体验

Desktop 展示平台语言层中的用户可理解名称，不显示任意底层安装参数。例如：

- 网络访问；
- 读取项目文件；
- 安装时执行第三方代码；
- 权限用途和限定范围；
- LOW/MEDIUM/HIGH/CRITICAL 风险文字与原因。

高关注权限使用独立警示样式。确认页同时持续显示“仅模拟，不会安装插件或修改你的电脑”。用户可以取消，也可以选择成功、失败后恢复成功、恢复失败三种测试场景。

第三方插件名称、版本和作者内容仍保持原文；产品操作文案共享 `packages/i18n` 的 `zh-CN` 与 `en-US` 资源。

## 7. 身份与授权

- 模拟事务要求现有 HarnessHub Session 已认证；
- actor 使用 HarnessHub 内部稳定 `User.id`，不用 GitHub username、display name 或 email；
- 事务绑定创建者，其他用户不能读取、确认、取消或查看其审计；
- 未登录 Desktop 只显示安全说明和登录门槛，不显示确认操作；
- 此处只是 Prototype 访问边界，不授予插件 Ownership、Developer Role 或 Registry 修改权限。

## 8. 步骤与不可修改审计

每个事务包含固定模拟步骤：

1. `MANIFEST_RESOLUTION`；
2. `ENVIRONMENT_CHECK`；
3. `PERMISSION_ANALYSIS`；
4. `USER_CONFIRMATION`；
5. `SIMULATED_APPLY`；
6. `SIMULATED_VERIFY`；
7. `SIMULATED_ROLLBACK`。

每次状态变化追加一个 `InstallationAuditEvent`：

```text
id
transaction_id
actor_user_id
action
from_status
to_status
timestamp
result
```

事件只追加，不提供更新或删除方法；读取结果是不可修改快照。当前存储只在本次 Desktop 进程内存在，退出后自然消失，因此不能被当作生产审计或恢复 Journal。

## 9. 跨平台接口预留

`EnvironmentManager` 只定义：

```ts
checkEnvironment(): PrototypeEnvironmentSnapshot
analyzeCapability(
  manifest: MockInstallationManifest,
  environment: PrototypeEnvironmentSnapshot,
): PrototypeCapabilityAnalysis
```

当前唯一实现是 `MockEnvironmentManager`。它不读取 `process.platform`，也不访问 macOS、Windows、Linux 或 DSH。未来真实实现必须在单独阶段使用版本化 Platform Adapter 与 DSH Adapter，并重新完成安全评审。

## 10. 测试覆盖

自动测试覆盖：

- 正常模拟安装到 `INSTALLED`；
- 用户取消；
- 模拟失败且回滚成功；
- 回滚失败进入 `RECOVERY_REQUIRED`；
- 未认证用户和跨用户访问拒绝；
- 审计读取快照不可修改；
- Mock Fixture 的模拟执行约束；
- 中文权限、风险和范围展示；
- 未登录 UI 不出现确认按钮；
- Web、API、Desktop、共享包及 Rust 壳的现有构建回归。

## 11. 与 Phase 3-B 的差异

Phase 3-B 描述未来真实 Installation Manifest、ConsentRecord、Recovery Journal、Profile 锁和 Platform/DSH Adapter。Phase 3-C 只验证状态、文案和交互：

| Phase 3-B 设计 | Phase 3-C 实现 |
|---|---|
| 本机持久事务与 Journal | 进程内模拟事务和审计 |
| 真实环境 Snapshot | 固定 `PROTOTYPE` Snapshot |
| Adapter 探测/执行 | 仅接口与无执行 Mock |
| 精确版本安装 | Fixture 元数据，不下载制品 |
| 回滚受管变更 | 模拟成功/失败结果 |

## 12. 后续真实安装门槛

本原型完成不代表可以直接加入命令执行。进入 Real Installation Engine / DSH Setup Assistant 前至少需要：

1. 确认首发 OS、architecture 和受支持的精确 DSH/Node/pnpm 版本；
2. 定义签名或等价的 Installation Manifest 真实性证明；
3. 建立原生命令 allowlist、严格参数 Schema 和无任意命令 IPC；
4. 使用隔离的临时 DSH Home/Profile 与无凭据环境；
5. 先实现持久 Recovery Journal、Profile 锁和崩溃一致性；
6. 对路径穿越、symlink/junction、TOCTOU、深链和命令注入做专项测试；
7. 明确 FULL/PARTIAL/NONE 回滚能力，不承诺无法撤销的外部副作用；
8. 完成 macOS/Windows/Linux 支持矩阵和外部桌面安全评审。

在这些门槛通过前，`MockInstallationEngine` 不应被替换、包装或扩展为真实执行器。
