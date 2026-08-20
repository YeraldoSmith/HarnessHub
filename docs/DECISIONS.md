# HarnessHub 决策记录

状态：持续更新

## 已确认

| ID | 决策 | 理由 |
|---|---|---|
| D-001 | 产品是第三方 DSH 生态平台，不是官方服务 | 避免品牌混淆并明确责任边界 |
| D-002 | 匿名浏览，写操作登录 | 降低发现门槛，同时保留滥用治理能力 |
| D-003 | Web 只负责发现；本机修改只在 Desktop | 浏览器不应拥有任意本机执行能力 |
| D-004 | v0.1 不处理任何资金 | 避免支付、退款、税务、洗钱和托管责任 |
| D-005 | 插件版本绑定不可变来源和扫描结果 | 可变 tag/branch 不能支撑安全结论 |
| D-006 | Git 安装构建脚本必须单独授权 | DSH 官方说明其在 Agent 沙箱之外执行 |
| D-007 | DSH 细节只进入独立适配层 | Developer Preview 会发生破坏性变化 |
| D-008 | 后端先做 NestJS 模块化单体 | 业务边界多，但 v0.1 没有微服务必要性 |
| D-009 | Supabase Auth + PostgreSQL，Prisma 访问 | 与既定栈一致，减少早期身份和数据库运维 |
| D-010 | Cloudflare 用于 Web/CDN/WAF；API 使用完整 Node 容器 | 避免 NestJS/Prisma/扫描任务被边缘运行时约束 |
| D-011 | 版本、作者、来源、扫描、人工审核徽章分离 | 防止一个“Verified”制造过度背书 |
| D-012 | Phase 0 不生成空业务包 | 先确认边界，避免骨架先锁死错误架构 |
| D-013 | 正式产品名称为 HarnessHub | 创始人已确认，不再作为开放命名问题 |
| D-014 | 英文定位为 Community Marketplace for AI Agent Plugins | 明确产品覆盖 AI Agent 插件市场，同时从 DSH 生态起步 |
| D-015 | YeraldoSmith 为唯一 Founder & Initial Maintainer | 建立初始归属、治理与身份基线 |
| D-016 | Phase 1-B 只同步手工白名单来源 | 避免把自动发现结果误当作已验证 Registry 数据 |
| D-017 | PluginVersion 与 PluginSnapshot 在数据库层不可变 | 让公开元数据能够追溯到历史来源证据 |
| D-018 | Prisma PostgreSQL Driver Adapter 显式应用连接串 schema | 防止测试或多环境连接意外落入 public Schema |
| D-019 | 重复同步追加 Snapshot，但复用相同版本身份 | 保留每次观察证据，同时避免制造重复 PluginVersion |
| D-020 | Phase 1-D 使用 PostgreSQL trigram/GIN 搜索，不引入外部搜索服务 | 满足早期数千插件规模并保持架构简单 |
| D-021 | 来源当前状态与不可变历史分离 | 上游失效时保留版本、证据和 Snapshot |
| D-022 | 基础限流使用单进程内存存储 | 当前无需 Redis；多实例部署前必须升级共享存储 |
| D-023 | User 与 OAuthIdentity 分离，外部身份以 provider + issuer + stable provider user ID 唯一 | 支持多 provider，并阻止 username、display name 或 email 进入授权 |
| D-024 | RoleAssignment 与 BadgeGrant 分离 | Role 是服务端权限事实；Badge 只是公开身份展示，不能产生授权 |
| D-025 | Founder 通过数据库 bootstrap 绑定 GitHub 数字 user ID `120692294` | 用户名可变，只能用于展示；普通 API 不得转移 Founder |
| D-026 | Phase 2-B1 先启用 GitHub-only OAuth，跨 provider email 自动合并被禁止 | Supabase 当前文档描述的按 email 自动 linking 会让新身份间接继承既有权限；Google 必须等待显式绑定门槛通过 |
| D-027 | Account Linking 必须由已登录用户 recent-auth 后显式发起 | 防止预注册接管、email 碰撞和会话劫持后的静默绑定 |
| D-028 | Phase 2-B1 由 NestJS 后端直接持有 GitHub OAuth callback 与平台 Session；此项取代 D-009 的 Phase 2-B1 Auth 实现部分 | 精确执行 PKCE/state、稳定 GitHub ID 和禁止 email 自动合并；PostgreSQL + Prisma 部分保持不变 |
| D-029 | Web 使用 HttpOnly Cookie；Desktop 通过单次 poll token 换取 opaque Session；数据库只保存 Session 摘要 | GitHub token 不进入客户端，桌面无需在 URL 或本地存储中传递长期凭据 |
| D-030 | `packages/i18n` 是 Web/Desktop/共享 UI 的唯一平台界面语言层；默认 `zh-CN`，同时支持 `en-US` | 提前阻止硬编码文案扩散，同时保持第三方插件作者内容原样与产品边界清晰 |
| D-031 | Phase 2-C 以 canonical public GitHub repository 默认分支的一次性文件挑战证明仓库控制权 | 不扩大登录 OAuth scope、不保存 GitHub token；随机挑战能证明实际写入/合并能力，并固定 repository/owner 数字 ID 与 commit evidence |
| D-032 | PluginOwnership、Developer Role 与 Verified Developer Badge 在成功验证事务中同时建立，但三者语义分离 | Ownership 是插件管理授权，Role 是平台权限事实，Badge 只是公开信任展示且不构成安全保证 |
| D-033 | Plugin Submission 是 Registry 之前的独立候选域；只有批准后的精确 SubmissionVersion 才能生成 PluginVersion/Snapshot | 防止 Draft 或审核中内容进入公开目录，并保持审核对象与安装对象一致 |
| D-034 | 已提交 revision 不可修改；修复和补充创建新的 SubmissionVersion | 保留每次检查、决定和申诉对应的精确事实，避免审核后换包 |
| D-035 | 首个插件允许非受限 DeveloperProfile 进入提交，但发布前必须完成来源控制权证明 | 避免只有现有 Verified Developer 才能加入的封闭生态，同时不降低来源验证门槛 |
| D-036 | Risk Level 只决定审核与用户确认深度；确认恶意、来源不一致、无授权和故意隐瞒是独立拒绝条件 | 保持开放提交与透明风险，避免把高能力插件等同恶意，也避免把 Critical 当作可自动发布 |
| D-037 | Submission 审核状态与发布后的 ACTIVE/SUSPENDED/DELISTED 状态分离 | 暂停分发不能抹除原审核历史，恢复/下架也需要独立理由和审计 |
| D-038 | Desktop 只从稳定 ID 重新获取版本化 Installation Manifest；深链和服务端都不能下发任意命令 | 防止命令注入，并保证 UI 展示、确认和实际目标来自同一不可变版本 |
| D-039 | 用户确认是短时单次 ConsentRecord，并绑定 plan、version、Profile、permission 与 environment digest | 版本、权限、计划或本机关键事实变化后旧确认必须失效，避免确认后换包/换计划 |
| D-040 | Installation Transaction 使用 Profile 锁与持久 Recovery Journal，并公开 FULL/PARTIAL/NONE 回滚覆盖度 | 防止并发和崩溃造成不可解释状态，同时承认安装脚本与外部副作用不能保证完整撤销 |
| D-041 | 服务端暂停可阻止新安装/更新并提示风险，但不能远程静默执行或卸载本机插件 | 保持用户对本机操作的最终控制，避免把安全 kill switch 变成远程命令通道 |
| D-042 | Environment Manager 只能通过版本化 DSH Adapter 与 Platform Adapter 处理本机差异；业务 UI 不解析 CLI 或拼装命令 | 隔离 DSH 预览版与跨平台变化，统一参数、路径和错误安全边界 |
| D-043 | 安装详情、绝对路径和 Recovery Journal 默认仅本机保存，诊断上传需用户预览确认 | 安装行为可追踪不等于必须集中上传，兼顾恢复能力与隐私最小化 |
| D-044 | Phase 3-C 使用独立纯 TypeScript 内存 Mock Engine，不复用 API、Registry 或 Tauri 原生命令作为执行入口 | 验证状态机和体验，同时以结构隔离证明原型不会下载、执行或修改用户环境 |
| D-045 | Prototype Manifest 必须同时声明 `simulationOnly: true` 与 `executionPolicy: SIMULATION_ONLY`，Mock Environment 固定禁止 DSH 执行和系统修改 | 防止测试 Fixture 或未来 Adapter 被误接成真实执行能力；违反约束立即失败 |
| D-046 | Prototype Audit Event 只追加并返回冻结快照，但不持久化 | 足够验证可追踪交互，又不把进程内日志误称为生产审计或恢复 Journal；真实安装前必须另行实现崩溃一致存储 |
| D-047 | Phase 4-A 原生环境检测只提供无参数 `detect_runtime_environment`，内部仅允许硬编码 `node/git/dsh --version` | 支持真实只读状态，同时阻止 UI、API、深链或插件把它变成任意命令执行入口 |
| D-048 | 原生版本探测关闭 stdin、限制输出为 8 KiB、超时 2 秒并且不经过 Shell | 控制异常 Runtime 的阻塞与输出风险，避免 Shell 解析；失败只返回 MISSING/ERROR |
| D-049 | Setup Assistant 只生成 `PLAN_ONLY`、`simulationOnly: true` 且所有步骤 `executable: false` 的计划 | 加快真实产品体验开发，但确认按钮不能提前获得下载、Profile 写入或执行能力 |
| D-050 | 未来 Trusted Install 首个切片同时要求官方测试插件、LOW、完整 Manifest、Verified Developer，且自动安装仍为 false | 缩小首个真实执行面的来源和风险，保留用户确认与原生层二次校验 |
| D-051 | HarnessHub 采用 Agent Workspace + Runtime Bridge 管理 DSH，不嵌入 DSH UI | 保持产品体验所有权与 Runtime 执行权分离，避免跟随 DSH Web UI 内部结构变化 |
| D-052 | Phase 4-C 推荐 Native Supervisor 管生命周期、HTTP 处理 typed unary、WebSocket 处理只读事件下行 | 与锁定 DSH carrier 方向一致，兼顾原型速度、流式状态和未来替换 IPC 的能力 |
| D-053 | Installation、Lifecycle、Activity、Connection 使用正交状态，并用 instance generation/sequence 丢弃旧事件 | 避免 NOT_INSTALLED/BUSY/ERROR 混在一个枚举导致非法状态，防止 restart 后晚到事件污染新 Runtime |
| D-054 | `sendRequest` 只允许编译期注册的 RuntimeRequestMap，不提供 method/payload passthrough | 防止 Runtime Bridge 退化为绕过权限的任意 DSH RPC 或命令代理 |
| D-055 | 云端 HarnessHub 数据不得直接生成本机 start/stop/prompt/approval/plugin execution | Registry policy 可以阻止或警告，但本机关键行为必须来自本机 UI 与 fresh consent |
| D-056 | 通用 RuntimeAdapter 使用 capability negotiation，DSH Profile/Bundle/RPC 不进入 Workspace domain | 支持 MCP/OpenAI/其他 Runtime，同时避免最低公分母模型和 DSH 特有概念外泄 |
| D-057 | Phase 4-C 使用进程内 Contract Fixture，不提前启动或修改真实 DSH | 最快验证用户体验、状态和安全合同，同时保持可逆和零系统副作用 |
| D-058 | Fixture 生成 loopback ephemeral origin 与临时凭据，但不真实绑定端口 | 验证未来 transport 的鉴权语义；真实 socket/IPC 留给具备 Native Supervisor 的 Phase 4-D |
| D-059 | Runtime Event 必须校验 schema、runtime、generation、sequence、时间与消息长度 | 避免重复、乱序、跨实例或恶意事件污染 Desktop 状态 |
| D-060 | Phase 4-D 替换 Transport，不改 RuntimeBridge 与 Agent Runtime UI 领域合同 | 控制真实 DSH 接入的改动面，并继续禁止通用命令透传 |

## P0：进入代码阶段前确认

### O-002 首发桌面平台

- 负责人：Product/Engineering
- 选项：macOS only；macOS + Windows；三平台。
- 建议默认：先 macOS 内测，同时从架构上避免平台锁定；Windows 在公开 v0.1 前纳入。
- 影响：签名、公证、路径/进程差异和测试矩阵。

### O-003 托管地区与目标用户地区

- 负责人：Founder/Legal
- 问题：首发服务面向哪些司法辖区，Supabase 项目部署在哪里？
- 影响：隐私政策、跨境数据、版权流程、数据保留和未成年人规则。

### O-004 审核责任

- 负责人：Founder
- 问题：谁负责高风险插件审核、紧急下架与申诉？响应时限是什么？
- 默认：没有明确值班负责人前，不开放自动公开提交。

### O-005 插件元数据标准

- 负责人：Engineering
- 问题：在 DSH 官方 Bundle 清单之外，是否要求仓库内提供 `harnesshub.json`？
- 建议默认：v0.1 不强制新增文件；平台表单保存补充元数据，待生态稳定后再评估可移植清单。

### O-006 支持的 DSH 版本

- 负责人：Engineering
- 问题：首个兼容矩阵覆盖单一版本还是版本范围？
- 建议默认：以锁定的 `0.1.0-rc.8` 事实基线开始，只对实测版本显示“已测试”。

## 已关闭问题

### O-001 产品名称

- 结论：正式名称为 HarnessHub，不修改产品名称。
- 说明：名称确认不替代公开发布前的商标、域名和同名产品风险核验。

## P1：Phase 1 内确认

- O-007：搜索方案先用 PostgreSQL 全文检索还是外部搜索服务；默认前者。
- O-008：扫描 Worker 的隔离平台与出网策略。
- O-009：对象存储供应商与报告保留期限。
- O-010：是否允许 tarball 作为公开来源；默认仅人工审核。
- O-011：插件单分类还是多分类；默认单主分类 + tags。
- O-012：安装成功计数的隐私保护与反作弊方案；默认不采集，直到方案通过评审。

## 变更方法

新决策增加 ID、日期、结论、理由、替代方案和影响。改变已确认决策时，不删除旧记录；新增替代决策并标记 supersedes。
