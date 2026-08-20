# HarnessHub Phase 2-A：Identity Foundation Architecture

状态：Phase 2-A design completed；Phase 2-B1 GitHub-only implementation completed

完成日期：2026-08-20

## 1. 范围与不可变原则

Phase 2-A 定义身份、账号绑定、角色、徽章和未来开发者认领的数据边界。Phase 2-B1 已按该边界实现 GitHub-only OAuth、身份迁移、Founder bootstrap、Web/Desktop Session 和最小登录 UI；用户中心、社区、支付、Google、账号绑定与 Developer Claim 仍未实现。

以下字段永远不能用于认证主体匹配、账号合并或权限判断：

- GitHub username / login；
- display name；
- email，即使提供方声明 `email_verified=true`；
- avatar、profile URL 或用户可编辑 metadata；
- Badge 文案或前端显示状态。

权限判断固定为：

```text
已验证的 provider identity
        ↓
OAuthIdentity(provider, issuer, provider_user_id)
        ↓
User.id
        ↓
有效 RoleAssignment
        ↓
服务端授权策略
```

用户名、名称和邮箱只能用于展示、通知或人工核对。认证成功不自动证明仓库所有权，开发者验证也不自动证明插件安全。

## 2. 领域关系

```text
User 1 ─── * OAuthIdentity
User 1 ─── * AuthPrincipal
User 1 ─── * RoleAssignment * ─── 1 Role
User 1 ─── * UserBadgeGrant * ─── 1 BadgeDefinition
User 1 ─── * IdentityLinkIntent
User 1 ─── * DeveloperClaim * ─── 1 Plugin

RoleAssignment  ─── authorization only
UserBadgeGrant  ─── public presentation only
DeveloperClaim ─── source ownership evidence only
```

OAuth 提供方负责证明外部主体；HarnessHub 数据库负责把该主体映射到内部 User，并独立决定权限。Auth broker 或 JWT 中的可编辑 metadata 不是授权事实来源。

## 3. User Model

`User` 是 HarnessHub 内部稳定主体，不直接保存 GitHub、Google、Apple 或 Microsoft ID。

```text
User

id                UUID / ULID, primary key
status            ACTIVE | SUSPENDED | DEACTIVATED | DELETED
created_at        timestamptz
updated_at        timestamptz
suspended_at      timestamptz?
deactivated_at    timestamptz?
deleted_at        timestamptz?
security_version  integer
```

规则：

- `id` 由 HarnessHub 生成，不使用 email、username 或 provider ID；
- `status` 控制能否建立新会话，但暂停或删除不改写历史审计；
- `security_version` 在高风险身份、角色或会话事件后递增，用于使旧会话失效；
- 公开资料属于未来独立 `Profile`，不得把公开 handle 当作 `User.id`；
- 不在 `User` 上放单一 `role` 字段，账号可以同时承担多个职责；
- 不在 `User` 上增加 `github_id`、`google_id` 等提供方专用列。

## 4. OAuthIdentity Model

```text
OAuthIdentity

id                    UUID / ULID, primary key
user_id               FK → User.id
provider              GITHUB | GOOGLE | APPLE | MICROSOFT
issuer                canonical issuer / provider namespace
provider_user_id      opaque, case-sensitive string
metadata              redacted JSONB
created_at            timestamptz
updated_at            timestamptz
last_authenticated_at timestamptz?
disabled_at           timestamptz?
```

数据库约束：

```text
UNIQUE(provider, issuer, provider_user_id)
UNIQUE(user_id, provider, issuer) WHERE disabled_at IS NULL
```

Phase 2 默认一个 HarnessHub User 在同一 provider/issuer 下只有一个有效身份。未来若确有多 GitHub 账号需求，需要单独修改此约束并重新评审账号恢复与所有权语义。

Provider Adapter 必须输出规范化身份：

| Provider | `provider_user_id` | 说明 |
|---|---|---|
| GitHub | 已认证 `/user` 响应中的数字 `id`，按字符串保存 | `login` 仅作展示快照 |
| Google | 已验证 ID Token 的 `sub` | email 不参与匹配 |
| Apple | 已验证 ID Token 的 `sub` | 以配置的 issuer/client 为边界 |
| Microsoft | 规范化的 `tid:oid`，或经评审后的 issuer + `sub` | 不能用 UPN、email 或 `preferred_username` |

`metadata` 只保存最小展示快照和调试所需的非敏感字段，例如 provider login、avatar URL 和最近观察时间。它必须经过 allowlist 和大小限制，不保存 access token、refresh token、原始 ID Token、Cookie 或完整 provider 响应。

如果未来仓库权限检查需要凭证，凭证进入独立的加密凭证存储并采用最小 scope、短有效期和可撤销设计，不能进入 `OAuthIdentity.metadata`。

## 5. Auth Broker 边界

Phase 2-B1 的 D-028 选择由 NestJS 后端直接处理 GitHub OAuth 协议和 HarnessHub Session，因此当前实现不需要 AuthPrincipal。若未来引入 Supabase Auth 或其他 broker，HarnessHub 授权仍不得读取 `user_metadata`、email 或 provider username，并需要增加独立映射：

```text
AuthPrincipal

id
user_id               FK → User.id
broker                SUPABASE
issuer                verified JWT issuer
subject               verified JWT sub
created_at
disabled_at?

UNIQUE(broker, issuer, subject)
```

服务端先完整验证 JWT signature、issuer、audience、expiry 等，再用 `(broker, issuer, subject)` 解析内部 `User.id`，最后查询 RoleAssignment。`AuthPrincipal` 只连接会话 broker 与内部 User；`OAuthIdentity` 才记录 GitHub/Google 等外部稳定身份。若未来改为 HarnessHub 自签会话且 session subject 直接使用 `User.id`，可以不再新增 broker principal，但不得绕过 OAuthIdentity 唯一约束。

当前 Supabase 文档说明 OAuth 身份可能按相同 email 自动合并。该行为会让一个新 provider 身份通过 email 间接继承现有 User 的权限，与本架构冲突。因此：

1. Phase 2-B 首先只启用 GitHub；
2. Google 和 Account Linking 上线前，必须在目标 Supabase 部署中证明跨 provider 的 email 自动合并已被禁用或隔离；
3. 如果托管配置无法可靠做到这一点，必须改用能执行本文件显式绑定流程的 Auth broker/服务端适配层；
4. 不得以“provider 已验证 email”为理由放宽此门槛。

## 6. 首次登录

收到 OAuth 回调后，服务端按 provider adapter 完成 token/回调验证，再执行：

```text
lookup OAuthIdentity by (provider, issuer, provider_user_id)
  ├─ found + User ACTIVE      → 建立该 User 的会话
  ├─ found + User not ACTIVE  → 拒绝登录并返回有限状态信息
  └─ not found               → 创建 User + OAuthIdentity + USER Role（单事务）
```

创建过程必须使用唯一约束处理并发回调；发生唯一冲突时重新读取，而不是创建第二个 User。Provider 返回相同 email 不触发查找、合并或恢复。

## 7. Account Linking

### 7.1 显式绑定流程

账号绑定只允许从已登录账号主动发起：

1. 用户使用现有身份完成 recent authentication；高权限账号还需满足未来的强认证策略；
2. 服务端创建短时 `IdentityLinkIntent`，绑定当前 `user_id`、目标 provider、session、PKCE/state/nonce 摘要和过期时间；
3. 用户在目标 provider 完成一次新的 OAuth 认证；
4. 服务端验证 exact redirect、state、PKCE、issuer、audience、nonce、时效和 provider token；
5. 在数据库事务中锁定目标 identity，并检查唯一约束；
6. 未绑定的 identity 才能加入当前 User；成功后写入审计、通知用户，并递增 `security_version`；
7. Link Intent 单次使用，无论成功失败都不可重放。

```text
IdentityLinkIntent

id, user_id, provider, issuer, state_hash, nonce_hash,
session_id_hash, status, expires_at, consumed_at?, created_at
```

状态：`PENDING | COMPLETED | FAILED | EXPIRED | CANCELLED`。

### 7.2 冲突处理

- identity 已属于当前 User：返回幂等成功，不重复插入；
- identity 已属于其他 User：拒绝绑定，不自动合并两个 User；
- 两个账号需要合并：进入独立恢复流程，要求分别证明对两个账号当前身份的控制权；
- 仅能证明相同 email、相同 display name 或相似 username：证据不足；
- 涉及 Founder/Admin：不提供普通自助合并，必须进入高权限恢复和审计流程。

### 7.3 解绑与恢复

- User 必须至少保留一个有效登录身份；
- 解绑需要 recent authentication，并通知所有已验证通知渠道；
- 解绑后递增 `security_version`，撤销相关会话和凭证；
- Founder 的 bootstrap GitHub identity 不可通过普通 API 解绑、替换或转移；
- 账号恢复不能根据 email、用户名或客服截图转移角色；高权限恢复需要单独治理程序。

## 8. Role Model

Role 代表服务端权限，不代表公开展示。

```text
Role

code          FOUNDER | ADMIN | MODERATOR | REVIEWER | DEVELOPER | USER
description
is_privileged

RoleAssignment

id
user_id
role_code
scope_type    PLATFORM | PLUGIN
scope_id      nullable
granted_by    User.id?
reason
created_at
expires_at?
revoked_at?
revoked_by?
```

授权规则取所有未撤销、未过期、scope 匹配的 RoleAssignment；客户端传入的 role/badge 值一律忽略。

数据库约束要求 `PLATFORM` scope 的 `scope_id IS NULL`，`PLUGIN` scope 的 `scope_id IS NOT NULL`；Founder/Admin/Moderator/Reviewer 仅允许平台 scope，Developer 可按未来策略使用平台或插件 scope。

| Role | 权限语义 |
|---|---|
| FOUNDER | 唯一项目最高维护角色；普通管理接口不可授予、撤销或转移 |
| ADMIN | 用户、插件和申诉管理；不能修改 Founder 归属 |
| MODERATOR | 社区内容治理；不获得插件审核或角色管理权限 |
| REVIEWER | 插件审核与风险复核；不获得社区处罚或 Founder 管理权限 |
| DEVELOPER | 进入开发者工作流；具体插件写权限仍要求有效 ownership/claim |
| USER | 普通登录用户的基础写权限 |

角色不采用简单的“等级越高自动拥有全部低级权限”模型。每个 API action 显式声明允许的 role + scope，避免 Moderator 意外获得 Reviewer 权限。

## 9. Badge Model

Badge 只用于公开身份/信任说明，不能用于 API 授权。

```text
BadgeDefinition

code          FOUNDER | OFFICIAL | VERIFIED_DEVELOPER | MODERATOR | REVIEWER
label
public_description

UserBadgeGrant

id
user_id
badge_code
granted_by?
evidence_type
evidence_ref?
created_at
expires_at?
revoked_at?
```

组织账号未来使用独立 `OrganizationBadgeGrant` 关联同一 BadgeDefinition，避免无外键的多态 subject。

| Badge | 显示 | 公开含义 |
|---|---|---|
| FOUNDER | ◆ Founder | 项目创建者身份；不代表插件质量 |
| OFFICIAL | ✓ Official | HarnessHub 官方账号/组织；不代表 DeepSeek 官方 |
| VERIFIED_DEVELOPER | ✓ Verified Developer | 至少有一项当前有效的开发者控制权验证；不代表所有插件安全 |
| MODERATOR | ◆ Moderator | 当前承担社区治理职责 |
| REVIEWER | ✓ Reviewer | 当前承担插件审核职责 |

角色与徽章可以在同一服务端事务中同步授予，但始终是两条独立记录。授权读取 RoleAssignment，UI 读取 UserBadgeGrant。角色撤销后对应职责徽章应同步撤销；徽章同步失败不能保留权限，且必须产生告警与审计事件。

## 10. Founder Bootstrap

Founder 公开身份为 YeraldoSmith。2026-08-20 通过 GitHub 公共 API 核验到其数字用户 ID 为：

```text
provider: GITHUB
issuer: https://github.com
provider_user_id: "120692294"
display login snapshot: YeraldoSmith
```

生产初始化前必须由 Founder 在独立渠道再次确认数字 ID。部署 migration/seed 在一个数据库事务中：

1. 创建预先确定的内部 User；
2. 创建上述 OAuthIdentity；
3. 创建 `USER` 与 `FOUNDER` RoleAssignment；
4. 创建唯一的 `FOUNDER` UserBadgeGrant；
5. 写入 bootstrap AuditEvent，包括 migration version 和操作者；
6. 校验恰好存在一个有效 Founder role、一个 Founder badge，且二者指向同一 User。

首次真实 GitHub OAuth 成功时，只有已验证 provider user ID 与预置 OAuthIdentity 完全一致，才为该 Founder User 建立 Session；username 或 email 不参与此步骤。当前后端直接 Session 模式不创建 AuthPrincipal。

数据库需要部分唯一约束，保证全平台最多一个未撤销的 Founder RoleAssignment 和 Founder Badge。普通角色 API、账号合并、解绑及删除流程均不能改变这组记录。用户名变化只更新展示 metadata，不影响 Founder 权限。

高风险 Founder 操作在 Phase 2 后续实现时必须要求 recent authentication、强认证、CSRF/Origin 防护和追加式审计；只持有普通旧会话不足以修改核心治理状态。

## 11. Developer Claim Foundation

开发者身份和插件控制权是两层事实：

```text
OAuth login
  ↓
DeveloperClaim(plugin, claimant, source identity)
  ↓
repository/package ownership verification
  ↓
PluginOwnership（有效授权关系）
  ↓
可选 VERIFIED_DEVELOPER badge
```

预留概念模型：

```text
DeveloperClaim

id
plugin_id
claimant_user_id
oauth_identity_id
provider
source_external_id       stable repository/package ID
status                   PENDING | VERIFYING | APPROVED | REJECTED | REVOKED | EXPIRED
proof_type
evidence_redacted
challenge_hash?
challenge_expires_at?
verified_at?
reviewed_by?
created_at
updated_at

PluginOwnership

id, plugin_id, user_id, developer_claim_id,
status, created_at, revoked_at?
```

验证规则：

- GitHub 登录只证明 GitHub 账号身份，不证明仓库所有权；
- 优先使用仓库数字 ID、provider owner ID、GitHub App installation/permission 或一次性 challenge；
- challenge 必须随机、限时、绑定 claim 和仓库，不保存长期有效 token；
- 已存在有效 ownership 时，新 claim 进入冲突/人工复核，不静默替换；
- 来源转移、权限撤销或仓库易主会使 ownership 进入复核，但不删除历史证据；
- Verified Developer badge 不替代插件级 ownership，也不构成安全背书。

## 12. 审计与安全事件

以下事件必须写入追加式 AuditEvent：首次身份创建、绑定、解绑、冲突、账号合并、角色授予/撤销、Badge 授予/撤销、Founder bootstrap、Developer Claim 状态变化及高权限恢复。

审计只保存必要的稳定 ID、结果、理由代码、request ID 和脱敏上下文，不保存 token、授权码、PKCE verifier、原始 provider payload 或完整 IP。

主要威胁及控制：

- email pre-account takeover：禁止 email 自动合并；
- username rename/reuse：授权只使用 provider stable ID；
- session hijack 后绑定攻击者身份：recent authentication、短时 Link Intent、PKCE/state/nonce；
- 并发创建重复账号：唯一约束和事务重读；
- Badge 越权：授权层完全不读取 Badge；
- Founder 身份转移：数据库唯一约束、受保护 bootstrap 记录和非自助恢复；
- provider token 泄露：最小 scope、服务端交换、凭证与身份元数据分离。

## 13. Phase 2 实现路线

### Phase 2-B1：GitHub OAuth

- 只启用 GitHub provider；
- 使用 Authorization Code + PKCE (`S256`) 和不可猜测的 state，callback 只接受预注册的精确 URI；
- 登录仅请求识别用户所需的最小权限，通过已认证 `/user` 读取数字 ID；不为未来仓库认领预先申请 `repo` 权限；
- 验证回调、PKCE/state、provider 数字 ID 和会话；
- 建立 User/OAuthIdentity/RoleAssignment/AuditEvent；
- 执行 Founder bootstrap 与不可转移约束；
- 暂不开放 Google、账号绑定、Developer Claim 或社区功能。

### Phase 2-B2：Account Linking + Google OAuth

- 先关闭或隔离 Auth broker 的 email 自动合并；
- 实现 IdentityLinkIntent、recent authentication、冲突拒绝、解绑和通知；
- 通过专门的账号接管、重放、并发和高权限测试后再启用 Google。

### Phase 2-C：Developer Claim

- GitHub 仓库控制权 challenge；
- 优先使用独立 GitHub App 的细粒度仓库权限和短期 installation/user token，不复用登录 token 扩大权限；
- PluginOwnership 与 Verified Developer badge；
- 冲突、撤销、来源转移和审计流程。

## 14. Phase 2-B1 实现结果

GitHub-only OAuth 已实现，且仍不能同时开放 Google 或自动账号绑定。Prisma migration 与安全回归测试已证明：

1. username、display name、email 无法影响授权；
2. Founder 只匹配 GitHub ID `120692294`；
3. 普通 API 无法创建、转移或撤销 Founder；
4. Provider identity 唯一冲突不会创建重复 User；
5. 所有认证失败不会泄露账号是否存在。

实现明细见 `docs/PHASE_2B1_GITHUB_OAUTH.md`。Google OAuth 和 Account Linking 只有在 email 自动合并门槛关闭后才能进入实现。
