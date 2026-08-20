# HarnessHub

**Community Marketplace for AI Agent Plugins**

**面向 AI Agent 插件生态的社区型市场平台**

HarnessHub 是面向 DeepSeek Harness（DSH）生态起步的第三方社区平台。它帮助用户发现、评估和安装插件，也帮助开发者发布、维护插件并获得可信反馈。

HarnessHub 由 **YeraldoSmith** 创建，初始身份为 **Founder & Initial Maintainer**。

> 当前状态：Phase 1-C 已完成。只读 Plugin Registry 已接入 PostgreSQL，当前收录 3 个经人工指定、由 GitHub/npm 交叉核对的真实来源，并提供追加式 Snapshot 历史与版本比较 API；Mock Plugin 仅保留为测试 fixture。

## v0.1 的最小闭环

用户能够：

1. 浏览和搜索 DSH 插件；
2. 看懂来源、版本、兼容性、权限与风险提示；
3. 在桌面端确认不可变版本后执行安装；
4. 查看安装结果，之后更新或卸载。

开发者能够：

1. 使用 GitHub 登录；
2. 认领或提交一个真实的 DSH Bundle；
3. 通过来源、许可证和基础安全检查；
4. 发布插件页并维护版本信息。

## 当前硬性边界

- HarnessHub 不是 DeepSeek 官方产品；产品页面必须清楚披露第三方身份。
- 匿名用户可以浏览；提交、评价、收藏、关注和举报需要登录。
- 平台不代收打赏、不托管赏金、不分账。
- 网页端只提供发现和安装指引；会修改本机 DSH Profile 的操作只在桌面端发生。
- 不承诺第三方插件绝对安全。任何自动扫描结果都必须附带范围和时间。
- 不自动批准 Git 依赖的安装构建脚本，也不静默安装或更新插件。
- DSH 尚处于开发者预览阶段，所有 DSH 集成都经过独立适配层。

## Phase 1-C 本地运行

要求：Node.js 22.19+、pnpm 11、PostgreSQL 17。macOS 可使用仓库内的项目级数据库启动脚本；它不会注册系统常驻服务。Desktop 原生壳检查还需要 Rust 工具链。

```bash
pnpm install
pnpm db:local:start
pnpm db:migrate
pnpm registry:sync
pnpm dev
```

启动后：

- Web Registry：`http://127.0.0.1:5173`
- Registry API：`http://127.0.0.1:3001`
- 健康检查：`http://127.0.0.1:3001/health`

完整检查：

```bash
pnpm check
pnpm test:integration
```

真实 Registry 来源由 `config/registry-sources.json` 明确列出，不扫描整个 GitHub。同步会交叉核对 GitHub/npm 包身份、仓库地址和许可证，并保存 commit SHA、精确 npm 版本、抓取时间与完整性证据。详见 [Phase 1-B Registry](docs/PHASE_1B_REGISTRY.md)。

停止项目级数据库：

```bash
pnpm db:local:stop
```

## 文档索引

- [产品规格](docs/PRODUCT_SPEC.md)
- [系统架构](docs/ARCHITECTURE.md)
- [数据库设计](docs/DATABASE_SCHEMA.md)
- [安全模型](docs/SECURITY_MODEL.md)
- [社区准则](docs/COMMUNITY_GUIDELINES.md)
- [创始原则](docs/FOUNDING_PRINCIPLES.md)
- [身份体系](docs/IDENTITY_SYSTEM.md)
- [治理模型](docs/GOVERNANCE.md)
- [开发者指南](docs/DEVELOPER_GUIDE.md)
- [路线图](docs/ROADMAP.md)
- [决策记录](docs/DECISIONS.md)
- [事实来源与版本基线](docs/SOURCES.md)
- [Phase 1-B Registry](docs/PHASE_1B_REGISTRY.md)
- [Phase 1-C Registry Hardening](docs/PHASE_1C_REGISTRY_HARDENING.md)

## 后续门槛

Phase 1 采用只读 Plugin Registry 范围。首发平台、托管地区和插件审核负责人仍需在进入相关上线阶段前确认。

## Copyright

HarnessHub

Created by YeraldoSmith

Copyright © 2026 YeraldoSmith
