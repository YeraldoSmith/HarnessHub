# HarnessHub Phase 1-C：Registry Hardening

状态：Completed

完成日期：2026-08-20

## 范围

Phase 1-C 继续限定在公开、只读 Registry，不包含账号、评论、评分、推荐、支付、Bounty、审核后台或自动安装。

## 真实来源

当前 `config/registry-sources.json` 包含 3 个手工指定来源。同步程序分别读取 GitHub 与 npm，验证 `dsh.bundle.patch`、包名、仓库 URL 和许可证，再保存当次 evidence。

单一来源失败不会阻止其余来源完成各自事务；命令最终仍返回失败状态并列出失败来源，避免静默忽略。

## Snapshot 历史

```text
GET /plugins/:id/snapshots
GET /plugins/:id/snapshots/compare?from=:snapshotId&to=:snapshotId
```

历史按 `checked_at` 倒序返回。比较结果只列出发生变化的 Registry 字段：version、source commit、npm version、compatibility、license 和 source。

相同插件、版本、commit 与 npm 版本会复用同一个不可变 `PluginVersion`；每次成功同步仍追加一个新的不可变 `PluginSnapshot`。

## PostgreSQL 集成测试

```bash
pnpm db:local:start
pnpm test:integration
```

测试固定使用 `harnesshub_test` Schema，并验证：

- Repository 确实读写 PostgreSQL；
- 重复同步得到 1 个 PluginVersion 与 2 个 Snapshot；
- 两条 GitHub/npm PluginSource 保持唯一；
- 数据库拒绝修改 PluginVersion；
- 测试结束后隔离 Schema 被清理。

## 信任边界

Snapshot 表示某一时间点获取并交叉核对的来源元数据。它不表示代码安全、作者身份认证、平台推荐或与 DeepSeek 官方存在关系。
