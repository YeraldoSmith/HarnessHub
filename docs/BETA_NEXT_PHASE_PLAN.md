# HarnessHub Beta 下一阶段计划

本计划在 Dark Mode、OAuth 降级与 Marketplace 离线加载回归修复完成后执行。它不改变 HarnessHub 的核心安全边界：自动收录只代表发现了来源，不代表插件安全、作者可信或允许安装。

公开 Beta 构建时必须通过 `VITE_HARNESSHUB_API_URL` 指向已部署的 HTTPS API。开发环境可继续使用 `127.0.0.1:3001`；API 离线不阻断公开 Registry 浏览，但 OAuth 只有连接到真实后端时才能完成。

## 阶段顺序

### Phase 6-A：Registry Source Aggregation

优先扩展 `packages/plugin-sources`，增加公开生态聚合 Adapter，按“候选来源”写入独立的收录队列，不直接进入受信任 Registry。

每次同步至少保存：

- 来源生态和原始 URL；
- 仓库、包名、作者声明；
- 版本、release/tag、commit SHA；
- 下载内容的公开完整性 hash 与抓取时间；
- 原始元数据证据；
- 来源当前可用性。

候选插件初始公开状态固定为：

```text
来源已收录
未验证安全
等待审核
```

处理管线：

```text
Source Aggregation
      ↓
Metadata Normalization
      ↓
Source Verification
      ↓
Permission Analysis
      ↓
Risk Level / Review
```

Adapter 不下载并执行插件代码，不运行构建脚本，不因为 npm/GitHub 热度自动授予信任。只有具备固定版本、完整证据和当前可用来源的插件才能进入后续受控安装评估。

### Phase 6-B：Guest-first Product Boundary

公开能力不依赖账号：

- 浏览、搜索和查看公开插件证据；
- 下载公开且来源可用的插件包；
- 准备隔离的 DSH Runtime；
- 对满足受控安装边界的插件发起本地安装。

登录只用于云端或社区身份能力：同步设置、多设备、收藏、历史记录、社区身份和徽章。所有安装确认仍在本机完成，服务端账号不能绕过权限确认或风险阻断。

### Phase 6-C：HarnessHub Public ID 与徽章

认证继续使用不可枚举的内部 UUID 与稳定 OAuth `provider_user_id`。另增加只用于展示的十位永久 Public ID：

```text
Founder  0000000001
User     0000000002
User     0000000003
```

Public ID 由数据库事务中的单一序列原子分配，创建后不可修改或复用。Founder 的 `0000000001` 只在数据库初始化时绑定 GitHub User ID `120692294`，不根据用户名判断。

新增公开徽章：

- Founder Badge：唯一 Founder；
- Early User Badge：在明确截止条件前创建的账号；
- Beta Tester Badge：满足测试贡献条件后由受控流程授予。

Role、Badge、插件风险等级保持分离。徽章不授予权限，也不代表插件安全。

### Phase 6-D：Official Announcements

建立独立公告模型和只读用户入口，支持版本更新、安全公告、维护通知和新插件推荐。管理员发布操作必须鉴权并写入审计事件。

客户端提供 Announcement Banner 与本地/账号已读状态；不加入回复、转发、关注或信息流，避免演变为社区动态系统。

## 建议验收门槛

1. 聚合来源和受信任 Registry 在数据模型与 UI 上无法混淆。
2. API 离线时，公开浏览和本地 Runtime 准备仍可使用。
3. 未登录用户不会因为账号状态被挡在公开功能之外。
4. Public ID 不参与认证或授权判断。
5. 公告只能由明确的管理员权限发布，已读状态不会泄露敏感行为轨迹。
6. 所有未知插件代码继续保持不可执行。

Developer Upload、Plugin Claim、Ownership Transfer 与 Verified Developer 在来源聚合稳定后继续开发，但不作为生态冷启动的前置条件。
