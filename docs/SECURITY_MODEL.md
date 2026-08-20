# HarnessHub 安全模型

状态：Draft v0.1

目标：降低第三方 DSH 插件的发现、安装和更新风险，而不是宣称消除风险。

## 1. 保护对象

- 用户本机文件、密钥、环境变量、浏览器数据和进程；
- DSH Profile、配置与会话完整性；
- 插件来源、版本、摘要和作者身份的真实性；
- HarnessHub 账户、审核权限和审计记录；
- 社区内容与举报者隐私；
- 桌面应用与更新通道的供应链。

## 2. 信任边界

| 边界 | 默认信任 |
|---|---|
| GitHub/npm 元数据 | 不信任，必须解析和固定版本 |
| 插件作者声明 | 作为证据之一，不作为安全结论 |
| 自动扫描 | 有限范围的检测信号 |
| 人工审核 | 对明确检查范围负责，不是永久保证 |
| HarnessHub API 返回 | 桌面端校验结构、签名和不可变引用 |
| DSH CLI 输出 | 版本相关，通过适配器解析 |
| 用户本机环境 | 可能已损坏或被篡改，执行前检查 |

## 3. DSH 特有风险基线

官方资料明确表明：

- DSH 仍在开发者预览阶段，可能发生破坏性兼容变更；
- Bundle 通过 `dsh.bundle` 清单向 Profile 贡献配置层；
- Git 安装可能运行包的 `prepare` 构建脚本；
- 该安装构建发生在 Agent 运行沙箱之外；
- 添加、删除或更新 Bundle 后，需要重启正在运行的 Profile；
- 默认 `workspace-write` 约束写入，但读取、网络和进程可见性并未全部限制；
- MCP server 命令等能力属于可信可执行代码，也不应被普通“权限说明”淡化。

因此，HarnessHub 的“权限”首先是一套披露与决策系统。除非有可验证的操作系统级隔离，不得把它写成强制安全边界。

## 4. 主要威胁

### 供应链

- 仓库被接管、tag 被移动、npm 账号被盗；
- 依赖混淆、拼写相似包、恶意更新；
- Git `prepare` 或 npm 生命周期脚本在安装期执行；
- 扫描的源码与实际安装制品不一致；
- 桌面自动更新渠道被劫持。

### 插件行为

- 读取 SSH key、API key、Cookie 或私密文件；
- 发送工作区内容、提示词或会话日志；
- 启动子进程、下载后续载荷或建立持久化；
- 修改更早 Bundle 的配置行，改变权限、模型或工具；
- 利用 Profile 热更新或重启后行为差异隐藏活动。

### 平台与社区

- 冒充作者、刷评分、恶意举报；
- XSS、SSRF、恶意 Markdown、开放跳转；
- 管理员账号接管或滥用审核权；
- 举报附件泄露、日志包含 token 或本机路径；
- 通过“已验证”措辞制造虚假安全背书。

## 5. 发布门禁

一个版本公开发布前必须满足：

1. 来源解析为不可变 commit、精确 npm 版本或内容摘要；
2. Bundle 清单存在且补丁路径可解析；
3. 扫描对象与用户将安装的对象具有同一摘要或可证明构建来源；
4. 许可证字段存在，未知或冲突时进入人工复核；
5. 安装脚本、网络下载、原生二进制和敏感能力已披露；
6. 兼容范围有明确状态：作者声明、平台测试或未知；
7. 高风险规则命中时必须人工决定；
8. 审核结果绑定扫描规则集和目标摘要。

任何来源发生变化都产生新版本记录，不能覆盖已扫描对象。

## 6. 扫描层次

### L0：元数据与完整性

- 清单结构、patch 路径、入口文件；
- commit/version/digest；
- 许可证与仓库来源；
- 生命周期脚本、原生二进制、压缩包和超大文件。

### L1：静态分析

- 文件系统、网络、进程、凭证和环境变量 API；
- 动态执行、混淆、下载执行、可疑编码载荷；
- Cordis/DSH 配置对既有 row 的覆盖；
- 依赖漏洞和已知恶意包信号；
- 域名、遥测与外部命令清单。

### L2：受控执行（后续阶段）

- 临时环境、无真实密钥、虚假 canary 数据；
- 默认禁止外网或使用记录型代理；
- 观察文件、进程和网络行为；
- 不把一次无异常执行等同于安全。

### L3：人工复核

适用于安装脚本、原生模块、混淆、凭证访问、广泛网络/文件访问、配置覆盖或高影响插件。

扫描报告必须公开“检查了什么、没有检查什么、何时检查、检查哪个摘要”。

## 7. 风险等级

| 等级 | 示例 | v0.1 处理 |
|---|---|---|
| Low | 纯 UI/格式化能力，无外部命令 | 自动规则通过后可发布 |
| Medium | 网络访问、工作区读写、普通子进程 | 强提示，可抽样复核 |
| High | 安装脚本、凭证、广泛文件读取、配置覆盖 | 强制人工复核与二次确认 |
| Critical | 已知恶意载荷、窃密、绕过确认、来源不一致 | 拒绝/下架并启动事件响应 |

等级是相对风险，不是安全评级。

## 8. 桌面安装安全

- 使用固定允许的可执行文件和参数数组，禁止 shell 字符串拼接；
- 不接受远端下发的任意命令；
- 深链只包含插件/版本标识，桌面端重新从可信 API 获取并验证；
- GitHub 安装固定 commit，npm 安装固定精确版本；
- 用户确认绑定 plan/version/Profile/permissions/environment digest，任何关键变化使确认失效；
- 不自动编辑 `pnpm-workspace.yaml` 的 `allowBuilds`；构建授权作为独立步骤，以“安装时执行第三方代码”说明其在 Agent 沙箱之外执行；
- 更新必须展示新增依赖、脚本、权限和风险差异；
- Profile 级互斥锁和持久 Recovery Journal 在第一项目标变更前建立；
- 操作前后验证 Profile；失败时明确区分自动 ROLLED_BACK 和 RECOVERY_REQUIRED；
- 回滚覆盖度显示 FULL/PARTIAL/NONE，不承诺撤销脚本网络调用、未知文件修改或凭据访问；
- 卸载只删除明确受管资源，用户数据默认保留；
- Publication 暂停阻止新安装/更新并提示风险，但不能远程静默卸载；
- 不收集命令完整输出，除非用户预览并主动提交；
- 安装计数不以设备指纹或隐蔽遥测实现。

完整设计见 `docs/INSTALLATION_SECURITY_ARCHITECTURE.md`。

## 9. Web/API 安全基线

- OAuth Authorization Code + PKCE；服务端验证 issuer、audience、expiry；
- Secure、HttpOnly、SameSite Cookie 或等效安全会话；
- Desktop OAuth 通过系统浏览器和一次性高熵 poll token 交付 HarnessHub Session；Session 明文不进入数据库，GitHub token 不进入客户端；
- OAuth state 原子单次消费，PKCE verifier 加密保存并在 callback 后清除；
- 所有写操作做 Origin/CSRF 防护和速率限制；
- Markdown 严格白名单净化，外链增加安全属性；
- URL 抓取仅允许经过规范化与 DNS/IP 检查的 GitHub/npm 来源，防 SSRF；
- 对象存储私有，附件通过短期授权访问；
- 管理员操作重新认证、最小权限并写入追加式审计；
- 密钥进入托管密钥系统，不进入仓库、日志、客户端或扫描报告；
- 依赖升级、SAST、secret scan 和构建制品签名进入 CI；
- 备份加密并定期验证恢复。

## 10. 身份、版权与滥用

- OAuth 主体使用 provider 的稳定唯一 ID；username、display name、email、头像和可编辑 metadata 永远不能参与权限判断；
- User、OAuthIdentity、RoleAssignment 与 BadgeGrant 分层保存；服务端授权不读取 Badge；
- 账号绑定必须由已登录用户在 recent authentication 后显式发起，并使用短时 state/PKCE/nonce；禁止根据相同 email 自动合并；
- Founder 通过数据库 bootstrap 绑定 GitHub 数字 user ID，全平台唯一，普通 API 不可转移或解绑；
- GitHub 登录不自动等同仓库所有权；
- Phase 2-C 认领只接受 canonical public GitHub repository 默认分支的一次性文件挑战；服务端固定数字 repository ID、owner 数字 ID/type、commit SHA 与观察时间；
- challenge nonce 明文只在创建响应返回，数据库保存 SHA-256；验证使用 constant-time 摘要比较；
- VerificationEvidence 在数据库层禁止更新和删除；成功授予 Ownership、Role 与 Badge 必须处于同一串行化事务；
- 私有仓库、直接 collaborator/team 权限和组织成员验证必须等待 fine-grained GitHub App，不扩大登录 OAuth scope；
- 作者移交必须通知现有关注者并重新验证；
- 版权投诉分离“紧急临时限制”和“最终判断”；
- 处罚、申诉和管理员覆盖均保留理由与证据；
- 举报者身份只向必要审核人员开放。

## 11. 事件响应

### Critical 插件事件

1. 立即关闭受影响版本的安装与更新入口；
2. 保留版本页面并显示明确警报，避免用户误认为“从未存在”；
3. 固定证据：摘要、来源、扫描报告、审核与时间线；
4. 通知已选择接收安全通知的相关用户；
5. 发布卸载、凭证轮换和检查指引；
6. 联系来源平台与作者；
7. 修复规则、回溯相似版本并发布事后报告。

平台需要有远端 kill switch 来禁用目录中的安装按钮，但不能在未经用户授权时远程卸载本机插件。

## 12. 禁止的产品表述

不得使用：

- “100% 安全”
- “平台保证无病毒/无后门”
- “Verified = 官方认可”
- “低风险 = 不会读取数据”
- “开源 = 安全”

推荐表述：

> HarnessHub 对这个不可变版本执行了列明的自动检查。自动检查不能发现所有风险；安装第三方插件前仍应审查来源、权限和变更。

## 13. 上线前安全门槛

- 完成桌面威胁建模和外部安全评审；
- 核心安装命令与深链解析具备模糊测试和恶意输入用例；
- 管理员权限、备份恢复和关键事件演练通过；
- 安全联系人、漏洞报告方式和响应时限公开；
- 正式服务条款、隐私政策、版权流程经目标司法辖区律师复核。

## 14. Plugin Submission 安全边界（Phase 3-A 设计）

- Draft 与公开 Registry 隔离；提交后的 SubmissionVersion 绑定精确 commit/package/integrity 并保持不可变；
- Source、Metadata、Compatibility、Security 和 Human Review 使用独立 CheckRun/Decision，任一结果不能冒充另一类结论；
- 上游临时错误记录为可重试 `ERROR`，不能把检查故障写成开发者 `REJECTED`；
- Risk Level 决定审核深度，不是安全认证或开发者信誉分；
- HIGH/CRITICAL 需要更强 Evidence 与人工复核；确认恶意、来源冲突、无授权和审核后摘要变化属于硬阻断；
- 检查结果公开对象摘要、工具/规则版本、时间、发现和未覆盖范围；拒绝、Changes Requested、暂停与人工覆盖提供 reason code、可执行解释和申诉路径；
- Publication 暂停安装/更新入口但保留 PluginVersion、Snapshot、决定理由和历史证据；
- 发布必须以幂等事务创建 PluginVersion、首个 Snapshot、Publication 及必要 Ownership，任何部分失败全部回滚。

## 15. Installation Prototype 安全边界（Phase 3-C 实现）

- `MockInstallationEngine` 只接受 `simulationOnly: true`、`executionPolicy: SIMULATION_ONLY` 的 Manifest；
- `MockEnvironmentManager` 固定声明 `dshExecutionAvailable: false` 和 `systemMutationAllowed: false`，不探测真实系统；
- Prototype 包不导入文件系统、网络、子进程、Tauri command、包管理器或 DSH Adapter；
- 未认证用户不能创建事务；事务绑定 HarnessHub 内部 User ID，跨用户读取和操作被拒绝；
- 权限确认在模拟应用前发生，取消后不能继续运行；
- 回滚失败必须进入 `RECOVERY_REQUIRED`，不得显示为成功；
- 状态变化只追加 Audit Event；当前仅在内存中存在，不冒充持久审计或 Recovery Journal；
- Desktop 持续显示“仅模拟”，`INSTALLED` 只表示模拟终态，不代表本机已安装插件。

## 16. Controlled Runtime Integration 安全边界（Phase 4-A 实现）

- 真实检测只存在于打包后的 Tauri Desktop；普通浏览器预览不探测本机；
- 唯一原生命令无输入，只运行硬编码的 `node --version`、`git --version`、`dsh --version`，不经过 Shell；
- stdin 关闭，stdout/stderr 保留上限各 8 KiB，单探测 2 秒超时；
- Native Snapshot 必须声明 `readOnly: true` 与 `systemMutationAllowed: false`，否则共享 Manager 拒绝接收；
- DSH Adapter 不执行探测或安装，只消费 Snapshot、解析版本、判断范围并生成计划；
- Setup Plan 必须是 `PLAN_ONLY`、`simulationOnly: true`、`confirmationRequired: true`，每一步 `executable: false`；
- Runtime Snapshot 接入 Mock Installation Engine 后，`dshExecutionAvailable` 和 `systemMutationAllowed` 继续固定为 false；
- Runtime/Setup 数据只在 Desktop 内存存在，不上传平台、架构或版本；
- HIGH/CRITICAL、非官方测试插件、不完整 Manifest 或未验证开发者都不能进入未来受控真实安装候选；满足条件也不允许自动安装。
