# HarnessHub Phase 1-B：Real Plugin Registry

状态：Completed

完成日期：2026-08-20

## 范围

Phase 1-B 只负责公开、只读的 Plugin Registry。它不包含用户、登录、评论、评分、推荐、打赏、Bounty、完整审核后台或自动安装。

## 数据流

```text
config/registry-sources.json
        │
        ├── GitHub Adapter → repository / README / license / tag / commit
        └── npm Adapter    → package / exact version / integrity / compatibility
                    │
                    ▼
        identity and license cross-check
                    │
                    ▼
          immutable Plugin Snapshot
                    │
                    ▼
        PluginRepository → PostgreSQL → Registry API
```

## 来源策略

- 只读取 `config/registry-sources.json` 中人工指定的来源；
- GitHub 仓库必须包含声明 `dsh.bundle.patch` 的 `package.json`；
- npm 精确版本必须包含相同 Bundle 声明；
- GitHub 包名、npm 包名、仓库 URL 和许可证必须交叉一致；
- 读取结果是“来源证据”，不是安全审核、官方认证或自动上架结论；
- 不扫描 GitHub topic，不自动发现或导入未知仓库。

## Evidence 与 Snapshot

GitHub evidence 保存仓库 URL、固定 commit SHA、release/tag、抓取时间、README SHA-256 和许可证。npm evidence 保存包名、精确版本、tarball URL、integrity、仓库 URL、抓取时间和许可证。

每次成功同步追加一个 `PluginSnapshot`。`PluginVersion` 由插件、版本、commit 和 npm 版本共同识别；版本与 Snapshot 在 PostgreSQL 层禁止更新和删除。

## 本地验证

```bash
pnpm install
pnpm db:local:start
pnpm db:migrate
pnpm registry:sync
pnpm check
pnpm dev
```

检查：

- `GET /health`
- `GET /plugins`
- `GET /plugins/:id`
- Web 列表、搜索和详情；
- Desktop 只读预览；
- Mock fixture 的 Schema、Repository、API 与 UI 测试。

测试完成后可运行 `pnpm db:local:stop` 停止项目级 PostgreSQL。
