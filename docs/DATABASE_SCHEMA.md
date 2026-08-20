# HarnessHub 数据库设计

状态：Phase 1-B Registry 已实现；其余为后续概念模型

目标数据库：PostgreSQL + Prisma

## 0. Phase 1-B 已实现模型

当前迁移只创建 Registry 所需的四张表，不提前创建身份、社区、支付或审核表。

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
```

- `plugin_versions.identity_key` 是插件 ID、版本、commit SHA 与 npm 版本的 SHA-256 组合身份；
- `plugin_versions` 和 `plugin_snapshots` 由数据库触发器禁止 `UPDATE` 与 `DELETE`；
- 同一版本再次同步只追加 Snapshot，不覆写历史证据；
- `plugin_sources.evidence` 保存当前来源状态，Snapshot 同时保留当次不可变证据；
- Mock Plugin 只存在于 `tests/fixtures`，Repository 拒绝写入 `is_mock: true` 的记录。

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

认证主体，不直接充当公开资料。

```text
id, auth_subject, email_hash?, status, role, created_at, updated_at, deleted_at?
```

- `auth_subject` 唯一，对应 Supabase Auth user ID；
- 不因 OAuth 提供方返回邮箱就默认公开保存；
- `status`: active / suspended / deleted。

### profiles

```text
id, user_id, handle, display_name, bio, avatar_url, support_url?, created_at, updated_at
```

- `user_id`、`handle` 唯一；
- Support URL 仅允许 HTTPS 和明确允许的平台/域名策略。

### external_identities

```text
id, user_id, provider, provider_subject, username, profile_url, verified_at, metadata_json
```

唯一约束：`(provider, provider_subject)`。

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
id, plugin_id, claimant_user_id, proof_type, proof_payload,
status, reviewed_by?, created_at, resolved_at?
```

证明内容避免保存长期有效的访问 token。

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
- `plugin_sources(source_type, locator)` 唯一；
- `plugin_versions(plugin_id, version)` 唯一；
- `scan_runs(plugin_version_id, target_digest, ruleset_version)` 索引；
- `comments(plugin_id, status, created_at desc)`；
- `moderation_cases(status, priority, created_at)`；
- 公开列表使用 `(status, published_at, id)` 游标，避免 offset 深分页；
- 数据库约束保护评分范围、自关注、有效状态和必要外键，不能只依赖前端。

## 10. 保留与删除

- OAuth token 不进入业务数据库；
- 原始扫描临时文件在任务后按策略删除；
- 举报附件使用短期签名 URL 和访问审计；
- 删除账户后，对公开资料去标识化；必要的安全、版权和审核记录按法律依据限期保留；
- 具体期限在隐私政策和托管地区确定后落表，并实现自动清理任务。
