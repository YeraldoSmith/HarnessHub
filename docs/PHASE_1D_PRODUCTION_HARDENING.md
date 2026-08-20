# HarnessHub Phase 1-D：Registry Production Hardening

状态：Completed

完成日期：2026-08-20

## 范围

Phase 1-D 是 Phase 1 的最终阶段，只强化公开只读 Registry。没有实现账号、OAuth、Developer Claim、评论、评分、推荐、安装、打赏或 Bounty。

## 分页与搜索

```text
GET /plugins?page=1&limit=20&q=terminal
```

响应：

```json
{
  "items": [],
  "total": 100,
  "page": 1,
  "hasNext": true
}
```

- `page` 从 1 开始；
- `limit` 范围 1–100，默认 20；
- 稳定排序为 name、id；
- 搜索覆盖名称、描述、分类、作者名称、作者 handle 和规范化标签；
- PostgreSQL 使用 `pg_trgm` 与 GIN 索引，不引入外部搜索服务。

## SyncJob

每个手工白名单来源同步前创建一条任务记录：

```text
PENDING → RUNNING → SUCCESS
                  ↘ FAILED
```

记录 plugin ID、来源、开始/结束时间和有限错误信息。`GET /sync-jobs` 可读取最近 100 条任务，也可用 `pluginId` 过滤。

## 来源失效

GitHub/npm 来源分别保存：

- UNKNOWN / AVAILABLE / UNAVAILABLE；
- last verified；
- unavailable since；
- 最后一次有限错误。

404/410 会把对应现有来源标为 UNAVAILABLE。插件、PluginVersion、evidence 与 Snapshot 保持可读；后续同步成功会恢复 AVAILABLE 并清除失效信息。

## API 基础保护

- 默认每 IP 每 60 秒 120 次请求；可用 `API_RATE_LIMIT` 和 `API_RATE_LIMIT_TTL_MS` 调整；
- 反向代理只信任 loopback；
- 禁用 `X-Powered-By`；
- 查询参数、页码、limit、插件 ID 和 Snapshot ID 严格校验；
- 统一错误 JSON，不向客户端返回未知异常、数据库细节或调用栈。

限流当前为单进程内存存储，符合“不引入复杂基础设施”的阶段约束。多实例部署前必须换成共享存储。

## 验证

```bash
pnpm check
pnpm test:integration
```

测试覆盖分页、文本/作者/标签搜索、SyncJob 成功与失败、来源失效、历史保留、版本不可变及隔离 PostgreSQL Schema 清理。

## Phase 1 完成

Phase 1-D 完成后以 `v0.1.0-registry-foundation` 标记 Registry Foundation。Phase 2 Identity Foundation 必须在单独任务中启动。
