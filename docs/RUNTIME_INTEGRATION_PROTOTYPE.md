# HarnessHub Controlled Runtime Integration Prototype

状态：Phase 4-A 已实现

更新时间：2026-08-20

## 1. 目标

Phase 4-A 把 Phase 3-C 的纯模拟安装流程连接到真实但只读的本机 Runtime 快照：

```text
Packaged HarnessHub Desktop
  -> input-free native detection command
  -> OS / architecture / Node.js / Git / DSH snapshot
  -> DSH compatibility assessment
  -> plan-only Setup Assistant
  -> simulation-only Installation Transaction
```

本阶段真实读取环境，但不执行安装。`Setup Assistant` 的确认只改变前端原型状态，不会下载 DSH、创建 Profile、运行安装命令或修改系统。

## 2. 安全边界

### 2.1 允许

- 读取编译目标的操作系统和 CPU 架构；
- 对硬编码的 `node`、`git`、`dsh` 执行固定 `--version` 参数；
- 展示检测结果和兼容性；
- 生成不可执行的 Setup Plan；
- 把环境 Snapshot ID、平台、架构和 DSH 状态连接到模拟安装事务。

### 2.2 禁止

- 接收来自 UI、API、深链或插件的命令、程序路径或参数；
- 经过 Shell 解析命令；
- 下载或安装 DSH；
- 执行插件代码、插件构建脚本或包管理器；
- 创建或修改 DSH Profile；
- 修改 PATH、环境变量、系统配置或用户文件；
- 自动安装任何软件；
- 把 HIGH/CRITICAL 风险降级为自动安装；
- 绕过 Setup Plan 的明确用户确认。

## 3. Runtime 架构

```text
apps/desktop/src/runtime-integration.tsx
  -> RuntimeEnvironmentManager
       -> ReadonlyEnvironmentProbe
            -> Tauri invoke("detect_runtime_environment")
                 -> fixed native probes
  -> ControlledDshAdapter
  -> RuntimeSetupPlanReview
  -> ControlledRuntimeInstallationEnvironment
       -> MockInstallationEngine
```

共享逻辑位于 `packages/runtime-integration`；原生探测位于 `apps/desktop/src-tauri/src/lib.rs`。Web、API、Registry 和插件内容不能调用或配置探测程序。

## 4. Environment Manager

### 4.1 原生 Snapshot

```text
RuntimeEnvironmentSnapshot

id
platform
architecture
node
git
dsh
captured_at
read_only = true
system_mutation_allowed = false
```

每个 Tool Probe 只包含：

```text
name
status = AVAILABLE | MISSING | ERROR
version_output
probe = FIXED_VERSION_ARGUMENT
read_only = true
```

原生层没有输入参数。探测目标和参数在代码中固定为：

```text
node --version
git --version
dsh --version
```

这不是通用命令执行 API。原生层不暴露 `program`、`args`、`cwd`、`env`、路径或 Shell 字符串。

### 4.2 资源限制

- 标准输入关闭；
- stdout/stderr 分别最多保留 8 KiB；
- 读取线程继续排空剩余输出，避免子进程因管道填满阻塞；
- 单个探测最多等待 2 秒；
- 超时后终止探测进程并返回 `ERROR`；
- UI 只显示规范化版本和状态，不显示任意执行入口。

### 4.3 平台

当前原生实现能够真实报告运行它的：

- macOS；
- Windows；
- Linux；
- CPU architecture。

`PlatformAdapter` 已为三平台定义同一能力结果：

```text
readOnlyDetection = true
setupPlanGeneration = true
runtimeExecution = false
systemMutation = false
dshSetupExecution = false
```

这不代表三平台真实安装已经完成或获得支持。

## 5. DSH Adapter

`ControlledDshAdapter` 实现：

```text
detect(environment)
getVersion(environment)
checkCompatibility(environment)
prepareInstallPlan(environment)
```

### 5.1 Detect

只消费已经生成的 Runtime Snapshot，不自行执行命令：

- `AVAILABLE`：检测到 DSH；
- `MISSING`：未找到 DSH；
- `ERROR`：探测超时、启动失败或版本命令失败。

### 5.2 Version

从受限版本输出中提取首个 SemVer 形式，不信任其余文本。无法提取时返回 `null`，UI 显示“版本未知”，不会猜测版本。

### 5.3 Compatibility

当前测试范围：

```text
>=0.1.0-rc.6 <0.2.0
```

结果独立区分：

- `COMPATIBLE`；
- `MISSING`；
- `INCOMPATIBLE`；
- `UNKNOWN`。

兼容结果只是版本范围判断，不是安全审核，也不会触发自动修复或安装。

## 6. Setup Assistant Prototype

当 Runtime Snapshot 可用时，Desktop 展示：

- OS 和 CPU architecture；
- Node.js、Git、DSH 的可用状态和版本；
- DSH 兼容结论；
- 最近检测时间；
-“准备安装计划”入口。

生成的 `RuntimeSetupPlan` 包含：

```text
environment_snapshot_id
dsh_status
steps
permissions
confirmation_required = true
simulation_only = true
execution_policy = PLAN_ONLY
```

计划固定展示三个未来步骤：

1. 准备经过批准的 DSH；
2. 创建隔离的 HarnessHub Profile；
3. 验证环境。

每个步骤都包含：

```text
executable = false
```

用户确认后只显示“Setup Assistant 模拟完成”。没有原生命令、下载、Profile 写入或系统修改与此按钮绑定。

## 7. 权限展示

Setup Plan 提前展示未来真实执行可能需要的能力：

- 网络下载经过批准的固定版本制品；
- 写入用户级隔离 Profile；
- 运行白名单中的 DSH 验证操作。

这些是未来权限预告，不表示当前已经获得、使用或静默批准。Phase 4-A 不请求管理员/root 权限。

## 8. 与 Installation Prototype 集成

`ControlledRuntimeInstallationEnvironment` 把真实只读 Runtime Snapshot 映射为 Phase 3-C 的模拟环境：

```text
runtime_snapshot_id
detected_platform
detected_architecture
dsh_detected
dsh_version
dsh_execution_available = false
system_mutation_allowed = false
```

因此 Permission Review 与 Installation Transaction 可以显示实际环境上下文，但 `MockInstallationEngine` 仍拒绝任何执行或系统修改能力。

Runtime 重新检测会创建新的 Snapshot，并重置尚未完成的模拟事务，防止旧环境事实与新计划混用。

## 9. Trusted Install 边界

Phase 4-A 只实现未来准入判断，不实现安装。

未来首个受控真实安装候选必须同时满足：

- 官方测试插件；
- `LOW` 风险；
- 完整、不可变 Manifest；
- `Verified Developer`。

任何条件缺失都产生明确 blocker。`HIGH` 和 `CRITICAL` 必须失败。即使所有条件满足：

```text
automaticInstallAllowed = false
```

用户确认、计划绑定、版本绑定和原生层二次校验仍不能省略。

## 10. 测试覆盖

### Runtime package

- macOS Snapshot 规范化；
- Node.js/Git 版本解析；
- DSH 未安装；
- DSH 已安装且兼容；
- DSH 不兼容；
- Setup Plan 全部不可执行；
- 三平台 Adapter 不允许执行；
- Trusted Install LOW/Verified/完整/官方条件；
- HIGH 风险阻断；
- 声称允许系统修改的 Snapshot 被拒绝；
- Runtime Snapshot 接入模拟 Installation Environment 后仍不可执行。

### Rust native layer

- 缺失程序返回 `MISSING`；
- Snapshot 永远只读并禁止系统修改；
- macOS 平台和 architecture 真实检测；
- 固定探测的超时、输出上限和无 stdin 由实现约束。

### Desktop

- Setup Plan 显示三类未来权限；
- 每个步骤显示“当前不可执行”；
- 浏览器预览不探测电脑；
- 打包后的 Tauri Desktop 调用无参数探测命令。

## 11. 进入真实安装前的门槛

Phase 4-A 完成后仍不能把 `executable` 改成 `true`。下一阶段建议先进行 Real Installation Slice 设计与外部桌面安全评审，并至少完成：

1. 锁定官方 DSH 制品来源、完整性摘要和签名验证；
2. 不依赖可变 PATH 选择真实安装程序，建立受信绝对路径与发布者验证；
3. 建立持久 Recovery Journal、Profile 锁和崩溃恢复；
4. 原生层使用枚举 operation ID 和严格参数 Schema，不接受任意命令；
5. 首个真实切片只操作隔离的临时 HarnessHub Profile；
6. 禁止插件代码、构建脚本和未知软件；
7. 明确用户确认、权限升级和差异预览；
8. 完成路径穿越、symlink、TOCTOU、命令注入和制品替换测试；
9. 先在单一 macOS 架构内测，再扩展 Windows/Linux；
10. 每个真实步骤都必须有可验证的 postcondition 和诚实回滚能力。

在这些门槛通过前，Setup Assistant 必须保持 `PLAN_ONLY`。
