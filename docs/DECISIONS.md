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
