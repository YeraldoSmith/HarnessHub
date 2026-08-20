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

## 更新规则

以下事件发生时必须重新核验并更新本页：

- 支持新的 DSH release/RC；
- CLI、Bundle/Profile 清单或权限模型变化；
- DeepSeek 品牌指南变化；
- 新增安装来源或自动构建能力；
- 上线新的兼容性或安全徽章。

更新时记录新的 commit、日期、版本和受影响的 HarnessHub 决策，并先运行 DSH 适配器契约测试。
