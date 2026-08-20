# HarnessHub 数据库设计

状态：Phase 1-D Registry Foundation、Phase 2-B1 Identity 与 Phase 2-C Developer Trust 已实现

目标数据库：PostgreSQL + Prisma

## 0. 已实现模型

Phase 1 migrations 创建 Registry 表；Phase 2-B1 增加 GitHub identity 与 Session 表；Phase 2-C 只增加 Developer Trust 表，不创建社区、支付、上传或审核后台表。

```text
plugins
  id, name, description, category, license, source_type,
  created_at, updated_at

plugin_versions
  id, plugin_id, version, source_commit, npm_version,
  compatibility, identity_key, created_at

plugin_sources
  id, plugin_id, provider, repository_url, package_name,
  evidence, created_at, updated_at

plugin_snapshots
  id, plugin_version_id, checked_at, source, data, evidence, created_at

sync_jobs
  id, plugin_id, source, status, started_at, finished_at, error, created_at

users
  id, status, security_version, created_at, updated_at,
  suspended_at, deactivated_at, deleted_at

oauth_identities
  id, user_id, provider, issuer, provider_user_id, metadata,
  created_at, updated_at, last_authenticated_at, disabled_at

role_assignments
  id, user_id, role, scope_type, scope_id, reason,
  created_at, expires_at, revoked_at

user_badge_grants
  id, user_id, badge, evidence_type, evidence_ref,
  created_at, expires_at, revoked_at

oauth_transactions
  id, state_hash, code_verifier_ciphertext, client, status,
  desktop_poll_token_hash, desktop_session_ciphertext,
  expires_at, consumed_at, completed_at, delivered_at

auth_sessions
  id, user_id, token_hash, client, created_at,
  expires_at, last_seen_at, revoked_at

audit_events
  id, actor_user_id, action, target_type, target_id, metadata, created_at

developer_profiles
  id, user_id, display_name, bio, website, verification_status,
  verified_at, created_at, updated_at

developer_claims
  id, plugin_id, claimant_user_id, oauth_identity_id, provider,
  source_external_id, source_owner_type, source_owner_external_id,
  repository_url, source_ref, status, proof_type, challenge_hash,
  challenge_path, challenge_expires_at, verified_at, resolved_at,
  error_code, created_at, updated_at

plugin_ownerships
  id, plugin_id, user_id, developer_claim_id, ownership_type,
  verification_method, source_external_id, source_owner_type,
  source_owner_external_id, verified_at, created_at, revoked_at

verification_evidence
  id, developer_claim_id, provider, evidence_type, source_external_id,
  source_owner_type, source_owner_external_id, repository_url,
  commit_sha, payload, observed_at, created_at
```

- `plugin_versions.identity_key` 是插件 ID、版本、commit SHA 与 npm 版本的 SHA-256 组合身份；
- `plugin_versions` 和 `plugin_snapshots` 由数据库触发器禁止 `UPDATE` 与 `DELETE`；
- 同一版本再次同步只追加 Snapshot，不覆写历史证据；
- `plugin_sources.evidence` 保存当前来源状态，Snapshot 同时保留当次不可变证据；
- Mock Plugin 只存在于 `tests/fixtures`，Repository 拒绝写入 `is_mock: true` 的记录。
- 集成测试固定使用 `harnesshub_test` Schema，测试后删除该隔离 Schema；Driver Adapter 同时显式设置 schema，不能只依赖连接串被底层驱动隐式理解。
- `plugins` 增加 `author_name`、`author_handle` 与 `tags`，避免分页搜索时扫描并解析全部 Snapshot JSON；
- 名称、描述、分类和作者使用 PostgreSQL `pg_trgm` GIN 索引，标签使用数组 GIN 索引；
- `plugin_sources` 增加 `status`、`last_verified_at`、`unavailable_since` 和 `last_error`；来源失效不级联删除历史数据；
- `sync_jobs.status` 为 PENDING / RUNNING / SUCCESS / FAILED，任务错误限制在可展示的来源级信息，不保存 token 或调用栈。
- `oauth_transactions.state_hash` 与 `auth_sessions.token_hash` 均唯一；数据库不保存 state 或 Session 明文；
- Founder 的 GitHub ID `120692294`、Role 与 Badge 由 migration 预置，两个部分唯一索引各自保证全平台唯一；
- 当前只有 GitHub provider。Developer Trust 已实现；`auth_principals`、`identity_link_intents`、Google linking、社区与审核模型仍未实现。
- 同一插件最多一个未撤销 OWNER；同一用户对同一插件最多一个未撤销 Ownership；同一用户不能并行创建重复 active Claim。
- `verification_evidence` 由数据库触发器禁止 `UPDATE` 与 `DELETE`；challenge 明文不入库，只保存 SHA-256。
- 成功验证在串行化事务中同时创建 Evidence、Ownership、Developer Role、Verified Developer Badge 与 Audit Event。

对应实现以 `apps/api/prisma/schema.prisma` 和已提交 migration 为准。

## 1. 设计规则

- 公共 ID 使用 UUID/ULID，不暴露递增主键；
- 所有时间使用 UTC；
- 用户可编辑内容保留修订和审核状态；
- 删除账户不应破坏必要的安全与审核审计；
- 插件、来源、版本和扫描结论分开建模；
- 计数是派生数据，不是唯一事实来源；
- 枚举在实现前统一列入 Prisma schema，禁止自由字符串状态蔓延。

## 2. 身份

### users

HarnessHub 内部主体，不直接充当公开资料，也不保存 provider 专用 ID。

```text
id, status, security_version, created_at, updated_at,
suspended_at?, deactivated_at?, deleted_at?
```

- `id` 为应用生成的 UUID/ULID；
- `status`: active / suspended / deactivated / deleted；
- provider user ID、username、display name 和 email 不进入权限判断；
- 不保存单一 `role` 字段，权限通过多条有效 `role_assignments` 计算；
- `security_version` 为后续批量会话失效策略预留；Phase 2-B1 通过逐条 `revoked_at` 撤销 Session。

### oauth_identities

```text
id, user_id, provider, issuer, provider_user_id, metadata,
created_at, updated_at, last_authenticated_at?, disabled_at?
```

- 唯一约束：`(provider, issuer, provider_user_id)`；
- Phase 2 默认同一 User 在一个 provider/issuer 下最多一个有效身份；
- GitHub 使用数字 user ID，Google 使用 `sub`，Microsoft 使用经 provider adapter 规范化的稳定 subject；
- metadata 只保存 allowlist 后的展示快照，不保存 token、原始 ID Token 或完整 provider payload；
- email 即使已验证也不触发自动账号合并。

### auth_principals（未来 Auth broker 模式，尚未实现）

```text
id, user_id, broker, issuer, subject, created_at, disabled_at?
```

- 唯一约束：`(broker, issuer, subject)`；
- 只映射经过完整 JWT 验证的 Auth broker session subject 到内部 User；
- 不替代 OAuthIdentity，也不读取 Supabase `user_metadata`、email 或 username 授权。

### roles / role_assignments

```text
roles
  code, description, is_privileged

role_assignments
  id, user_id, role_code, scope_type, scope_id?, granted_by?, reason,
  created_at, expires_at?, revoked_at?, revoked_by?
```

Role code：founder / admin / moderator / reviewer / developer / user。Founder 的有效 assignment 使用部分唯一约束保证全平台唯一；普通管理流程不可创建、撤销或转移 Founder。

Phase 2-B1 使用 Prisma/PostgreSQL `PlatformRole` enum，不创建 `roles` lookup table；上面的 `roles` 表是未来需要动态角色描述时的候选设计。

### badge_definitions / user_badge_grants

```text
badge_definitions
  code, label, public_description

user_badge_grants
  id, user_id, badge_code, granted_by?, evidence_type, evidence_ref?,
  created_at, expires_at?, revoked_at?
```

Badge 只用于公开展示。API 授权只能读取 RoleAssignment，不读取 Badge。组织账号未来使用独立的 `organization_badge_grants`，不使用无外键多态记录。

Phase 2-B1 使用 `IdentityBadge` enum，不创建 `badge_definitions` lookup table；公开文案由共享 UI 映射。

### identity_link_intents

```text
id, user_id, provider, issuer, state_hash, nonce_hash, session_id_hash,
status, expires_at, consumed_at?, created_at
```

短时、单次使用，承载显式账号绑定；不能根据相同 email 自动产生绑定。

### profiles

```text
id, user_id, handle, display_name, bio, avatar_url, support_url?, created_at, updated_at
```

- `user_id`、`handle` 唯一；
- Support URL 仅允许 HTTPS 和明确允许的平台/域名策略。

## 3. 插件目录

### plugins

稳定产品实体，不承载某个版本的安全结论。

```text
id, slug, name, summary, description, category_id?, lifecycle_status,
owner_profile_id?, latest_published_version_id?, created_at, updated_at, delisted_at?
```

`lifecycle_status`: draft / pending / published / restricted / delisted / archived。

### plugin_sources

```text
id, plugin_id, source_type, locator, repository_url?, package_name?,
default_branch?, ownership_status, discovered_at, last_synced_at
```

- `source_type`: github / npm / tarball；v0.1 公共目录不接受任意本机路径；
- `locator` 规范化并唯一；
- 仓库与 npm 包可以同时属于一个插件，但每个发布版本必须指向明确来源。

### plugin_versions

```text
id, plugin_id, version, source_id, source_ref, resolved_commit_sha?,
artifact_integrity?, manifest_json, dsh_range_declared?, dsh_range_tested?,
release_notes?, published_at?, status, created_at
```

- 唯一约束：`(plugin_id, version)`；
- `source_ref` 必须是精确 npm 版本、commit SHA 或不可变 tarball 摘要；
- `status`: candidate / scanning / review / published / blocked / withdrawn / superseded。

### plugin_permissions

权限和敏感能力是版本级事实。

```text
id, plugin_version_id, capability, evidence_type, evidence_location,
declared_by_author, detected_by_scanner, severity, explanation
```

示例 capability：filesystem_read、filesystem_write、network、subprocess、credentials、browser、install_script、telemetry。

这些字段是披露与证据，不等同于运行时强制隔离。

### categories / plugin_categories

若一个插件可属于多个分类，使用连接表；否则 v0.1 可先保留单分类。最终选择在 Prisma 实现前确认。

## 4. 采集、安全与审核

### ingestion_jobs

```text
id, source_id, trigger, status, attempt_count, started_at?, finished_at?,
error_code?, error_detail_redacted?, parser_version
```

### scan_runs

```text
id, plugin_version_id, target_digest, scanner_version, ruleset_version,
status, risk_level, coverage_json, started_at, finished_at?, report_object_key?
```

### scan_findings

```text
id, scan_run_id, rule_id, severity, title, description, evidence_json,
location?, disposition, created_at
```

`disposition`: open / accepted_risk / fixed / false_positive。处置必须关联审核记录。

### moderation_cases

统一承载提交审核、举报、版权通知和申诉。

```text
id, case_type, subject_type, subject_id, reporter_user_id?, status,
priority, assigned_to?, policy_version, created_at, updated_at, closed_at?
```

### moderation_actions

```text
id, case_id, actor_user_id, action, reason_code, rationale,
evidence_object_key?, effective_until?, created_at
```

追加式记录，不允许就地覆写历史决定。

### developer_claims

```text
id, plugin_id, claimant_user_id, oauth_identity_id, provider,
source_external_id, proof_type, evidence_redacted, challenge_hash?,
challenge_expires_at?, status, verified_at?, reviewed_by?,
created_at, updated_at
```

`status`: pending / verifying / approved / rejected / revoked / expired。仓库/包使用 provider 的稳定外部 ID；证明内容避免保存长期有效的访问 token。

### plugin_ownerships

```text
id, plugin_id, user_id, developer_claim_id, status, created_at, revoked_at?
```

实际插件写权限读取有效 ownership，不因全局 Developer role 或 Verified Developer badge 自动获得。

## 5. 社区

### favorites

```text
user_id, plugin_id, created_at
```

联合唯一键 `(user_id, plugin_id)`，默认不公开用户的收藏列表。

### follows

```text
follower_user_id, followed_profile_id, created_at
```

禁止关注自己；默认只公开聚合数，不公开完整关注关系。

### ratings

```text
id, user_id, plugin_id, plugin_version_id?, score, status, created_at, updated_at
```

- 每个用户对插件仅有一个有效评分；
- `score` 范围 1–5；
- 版本可选，用于解释评分时的兼容背景。

### comments

```text
id, plugin_id, plugin_version_id?, author_user_id, parent_id?, body,
status, created_at, updated_at, deleted_at?
```

`status`: visible / hidden / removed / author_deleted。删除后保留最少占位以维护对话结构。

### reports

```text
id, reporter_user_id?, subject_type, subject_id, reason_code,
description, evidence_object_key?, status, created_at
```

同一目标的相似举报可聚合，但不能丢失独立证据。

## 6. Plugin Requests

### plugin_requests

```text
id, author_user_id, title, description, acceptance_criteria,
status, claimed_by_profile_id?, created_at, updated_at, closed_at?
```

`status`: open / claimed / in_progress / delivered / closed / withdrawn。

### request_updates

```text
id, request_id, author_user_id, from_status, to_status, body?, created_at
```

数据库中不包含 bounty amount、wallet、balance、escrow 或 payout 表。外部赞助链接也不能表述为平台担保付款。

## 7. 审计与运营

### audit_events

```text
id, actor_type, actor_id?, action, target_type, target_id?,
request_id?, ip_prefix_hash?, metadata_redacted_json, created_at
```

高风险操作必须记录：角色变更、发布/下架、扫描结论覆盖、举报处置、身份认领和数据导出。

### feature_flags

```text
key, value_json, environment, updated_by, updated_at
```

DSH 兼容性故障时，可快速关闭特定版本的安装入口而不删除目录信息。

## 8. 主要关系

```text
users 1──1 profiles
users 1──* oauth_identities
users 1──* auth_principals
users 1──* role_assignments *──1 roles
users 1──* user_badge_grants *──1 badge_definitions
users 1──* identity_link_intents
profiles 1──* plugins (owner)
plugins 1──* plugin_sources
plugins 1──* plugin_versions
plugin_versions 1──* plugin_permissions
plugin_versions 1──* scan_runs 1──* scan_findings
plugins *──* users (favorites, ratings)
profiles *──* users (follows)
moderation_cases 1──* moderation_actions
plugin_requests 1──* request_updates
```

## 9. 索引与约束

- `plugins(slug)` 唯一；
- `oauth_identities(provider, issuer, provider_user_id)` 唯一；
- `auth_principals(broker, issuer, subject)` 唯一；
- 同一 `user_id + provider + issuer` 最多一个有效 OAuth identity；
- 全平台最多一个有效 Founder RoleAssignment 和 Founder Badge；
- `plugin_sources(source_type, locator)` 唯一；
- `plugin_versions(plugin_id, version)` 唯一；
- `scan_runs(plugin_version_id, target_digest, ruleset_version)` 索引；
- `comments(plugin_id, status, created_at desc)`；
- `moderation_cases(status, priority, created_at)`；
- Phase 1-D 公开列表按 `(name, id)` 稳定排序并限制 `limit <= 100`；规模或写入频率超过页码分页边界时再增加游标契约；
- 数据库约束保护评分范围、自关注、有效状态和必要外键，不能只依赖前端。

## 10. 保留与删除

- OAuth token 不进入业务数据库；
- 原始扫描临时文件在任务后按策略删除；
- 举报附件使用短期签名 URL 和访问审计；
- 删除账户后，对公开资料去标识化；必要的安全、版权和审核记录按法律依据限期保留；
- 具体期限在隐私政策和托管地区确定后落表，并实现自动清理任务。
