# 事实来源与版本基线

本页记录 HarnessHub 设计依赖的外部事实。产品文档不能把搜索结果、第三方目录或旧版本行为当成永久契约。

## DSH 基线

- 官方仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- 本次核验提交：`141eb6fef83422698aef7a981029e843e8161534`
- 提交日期：2026-08-19
- 仓库版本：`0.1.0-rc.8`
- 核验日期：2026-08-20
- 状态：Developer Preview；官方明确提醒会有破坏性兼容变更。

## 使用的官方资料

- [README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md)：项目身份、运行方式、Developer Preview 状态和 `dsh-plugin` topic。
- [插件打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)：Bundle/Profile 清单、安装来源、Git `prepare`/`allowBuilds` 风险和固定 commit 建议。
- [CLI 行为参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)：Profile 层级、插件管理、重启要求、权限基线和命令行为。
- [MIT License](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE)：上游仓库许可证。
- [Brand Guidelines](https://github.com/deepseek-ai/deepseek-harness/blob/master/BRAND_GUIDELINES.md)：品牌使用在公开发布前重新核验。

## 已核验事实

1. DSH 使用“Everything is a Plugin”架构。
2. 官方发现建议是给插件仓库添加 GitHub `dsh-plugin` topic。
3. 可安装分发单元是声明 `dsh.bundle` 的 npm Bundle；Profile 通过 `dsh.profile.bundles` 组合 Bundle。
4. `dsh plugin --profile <name>` 将包管理操作交给 pnpm，并维护 Profile 的 Bundle 列表。
5. Git 来源可能通过 `prepare` 在安装时构建；pnpm 要求用户通过 `allowBuilds` 显式授权。
6. 官方明确提示安装构建发生在 Agent 沙箱之外，应只信任固定 commit 的来源。
7. 添加、删除或更新 Bundle 后，正在运行的 Profile 需要重启。
8. 当前默认 `workspace-write` 并非完整机密隔离：读取、网络和进程可见性没有被全部限制。
9. 当前仓库 Node.js engine 为 `^22.19.0 || >=24.0.0`；这属于当前基线，不能硬编码为永久要求。

## Phase 1-B Registry 来源

首个真实 Registry 记录由人工加入白名单，不代表 HarnessHub、DeepSeek 官方或安全认证：

- GitHub：[`jiesou/dsh-cline-free-provider`](https://github.com/jiesou/dsh-cline-free-provider)
- npm：[`@jiesou/dsh-cline-free-provider`](https://www.npmjs.com/package/@jiesou/dsh-cline-free-provider)
- 首次同步版本：`0.1.9`
- 首次同步 commit：`79c37df51faef9f13cff94e77de86d25b87b42cb`
- 同步日期：2026-08-20

每次同步以当次生成的数据库 Snapshot 为事实记录；本文档中的版本号只描述首个里程碑，可能随 Registry 后续同步而过时。

Phase 1-C 新增人工白名单来源：

- [`NanmiCoder/dsh-agent-teams`](https://github.com/NanmiCoder/dsh-agent-teams) / [`@nanmicoder/dsh-agent-teams`](https://www.npmjs.com/package/@nanmicoder/dsh-agent-teams)，首次同步 `0.1.8`，commit `801954dd7be67213cf4adc1aeb6f97bd3daa12cc`；
- [`ccch1mneyyy/dsh-TUI`](https://github.com/ccch1mneyyy/dsh-TUI) / [`@deepseek-harness-tui/dsh-tui`](https://www.npmjs.com/package/@deepseek-harness-tui/dsh-tui)，首次同步 `0.8.5`，commit `1f93efe85360560e3da49726d7a55af659e771fe`。

这些记录只证明同步时 GitHub/npm 身份、Bundle 声明、仓库与许可证能够交叉核对，不是安全审核、官方收录或推荐。

## Phase 1-D 基础设施来源

- [NestJS Rate Limiting](https://docs.nestjs.com/security/rate-limiting)：基础 API 限流采用官方 `@nestjs/throttler` 模块和全局 Guard；当前使用进程内存储，不引入 Redis 等额外基础设施。
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)：名称、描述、分类和作者字段使用 trigram GIN 索引支撑模糊搜索；标签使用原生数组 GIN 索引。

## Phase 2-A 身份架构来源

- [GitHub REST Users API](https://docs.github.com/en/rest/users)：GitHub 提供按数字 ID 读取用户及获取已认证用户的接口；HarnessHub 使用 provider 数字 user ID，不使用 login 作权限键。
- [GitHub OAuth authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)：GitHub.com 支持 Authorization Code 与 PKCE `S256`，并建议使用不可猜测 state；Phase 2-B1 以此作为回调基线。
- [GitHub App 与 OAuth App 的差异](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)：仓库认领后续优先使用 GitHub App 的细粒度权限与短期 token，不扩大登录 OAuth 权限。
- [YeraldoSmith GitHub API record](https://api.github.com/users/YeraldoSmith)：2026-08-20 核验 `id = 120692294`；生产 bootstrap 前仍需 Founder 独立确认。
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/reference)：Google 明确要求使用不会变化/复用的 `sub` 识别用户，并警告不能把 email 当主标识。
- [Microsoft ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)：名称、email、preferred username 可变；Microsoft 场景使用稳定 `sub` 或 tenant-aware `oid`。
- [OAuth 2.0 Security BCP, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)：Phase 2-B 的 redirect、Authorization Code/PKCE、token 和攻击模型安全基线。
- [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)：当前文档说明 OAuth identity 可能按相同 email 自动 linking，同时提供已登录用户发起的 manual linking。HarnessHub 禁止前者作为权限继承路径，第二 provider 上线前必须验证目标部署的隔离能力。
- [Supabase Identity object](https://supabase.com/docs/guides/auth/identities)：`provider_id` 是 OAuth provider 返回的账号 ID；`identity_data` 只作为外部 metadata，不作为 HarnessHub 授权事实。

## Phase 2-C Developer Trust 来源

- [GitHub REST Repository API](https://docs.github.com/en/rest/repos/repos)：读取 canonical repository URL、数字 repository ID、default branch、visibility、archived 状态与 owner 资料。
- [GitHub REST Repository Contents API](https://docs.github.com/en/rest/repos/contents)：从公开仓库指定 ref 读取一次性证明文件、blob SHA 和内容；公开资源允许无需身份验证读取。
- [GitHub REST Commits API](https://docs.github.com/en/rest/commits/commits)：按 path 和 branch 读取最后修改证明文件的 commit SHA。
- [GitHub REST authentication](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)：未认证请求只用于公开资源；私有仓库和直接权限检查留给后续 fine-grained GitHub App。

## Phase 3-B Installation Security 基线

Phase 3-B 没有探测本机环境或执行 DSH。设计继续使用本页顶部锁定的 DSH commit 与官方安装/CLI 资料，特别依赖以下已核验边界：Git 来源可能触发安装构建、构建发生在 Agent 沙箱之外、Git 应固定 commit、构建授权不能静默批准、Bundle 变更后 Profile 可能需要重启。

进入任何真实 Installation Prototype 前必须重新核验 DSH 版本、CLI、Bundle/Profile 契约、Node/pnpm 要求和 `allowBuilds` 行为；文档中的 Adapter 接口不能被当作当前 DSH 永久契约。

## 更新规则

以下事件发生时必须重新核验并更新本页：

- 支持新的 DSH release/RC；
- CLI、Bundle/Profile 清单或权限模型变化；
- DeepSeek 品牌指南变化；
- 新增安装来源或自动构建能力；
- 上线新的兼容性或安全徽章。

更新时记录新的 commit、日期、版本和受影响的 HarnessHub 决策，并先运行 DSH 适配器契约测试。
