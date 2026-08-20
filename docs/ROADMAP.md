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

## Phase 3：安全桌面安装

### 目标

打通用户发现到本机安装的核心闭环。

### 交付

- Tauri 桌面壳和签名更新机制；
- DSH/Node/pnpm/Profile 检测；
- 不可变候选解析和安装预检；
- 独立的构建脚本授权步骤；
- 安装、验证、更新、卸载和恢复状态机；
- 本机日志与用户主动提交诊断；
- DSH 版本兼容 kill switch。

### 退出条件

- 测试 Bundle 在支持平台完成完整生命周期；
- shell 注入、恶意深链、摘要变化和中断场景通过测试；
- Git 构建脚本永远不会被静默批准；
- 失败后 Profile 状态可解释并有恢复路径；
- 外部桌面安全评审的阻断问题已解决。

## Phase 4：社区与需求市场

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

## Phase 5：生态质量

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
