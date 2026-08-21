# HarnessHub 产品介绍 / Product Overview

状态：Public Beta
更新：2026-08-21

## 产品定位

HarnessHub 是面向 AI Agent 插件生态的社区型市场平台，也是一个本地优先的
Desktop 工作台。它让用户在安装前看见来源、版本、许可证、兼容性、权限和风险
线索；让开发者未来能够建立可核验的插件归属与维护记录。

HarnessHub starts with DeepSeek Harness (DSH). It does not present itself as a
DeepSeek product, an official DSH distribution, or a replacement for DSH's own
security and permission controls.

## 面向谁

| 用户 | 获得的价值 |
| --- | --- |
| 普通使用者 | 不登录即可浏览插件、准备本地 Runtime，并在明确确认后管理本地插件。 |
| 技术用户 | 可核对来源 URL、commit、版本、完整性证据、Snapshot 与本地审计。 |
| 插件开发者 | 后续可通过身份与仓库验证建立维护和认领关系。 |
| 社区审核者 | 后续可基于不可变证据、风险分级和透明规则进行复核。 |

## 当前 Beta 能力

1. **插件 Registry**：检索插件元数据、来源、版本、许可证、兼容性、权限与风险。
2. **公开来源发现**：收集 GitHub/npm 公开元数据，保留仓库、作者、commit、hash、
   Stars 和更新时间。收录不等于认证。
3. **Guest-first Desktop**：游客可使用基础浏览、本地 Runtime 准备和本地插件操作。
4. **隔离 Runtime**：固定版本的 Node.js、pnpm、DSH 和 Profile 保存在 HarnessHub
   的应用数据目录，不修改全局 PATH、Shell 配置或既有 `DSH_HOME`。
5. **Runtime Bridge**：启动、停止、健康检查并在受控窗口中打开本机 DSH 工作区。
6. **本地审计与恢复**：安装操作记录在本机；失败不能伪装为成功，并保留恢复状态。

## 不承诺的事项

- 不承诺第三方插件没有漏洞、后门、侵权或不兼容问题；
- 不替用户保管模型 API Key，也不替 DSH 作模型、工具或权限决定；
- 不执行未确认的第三方代码，不静默修改用户系统环境；
- 不代收付款、打赏、悬赏或进行资金托管；
- Public Beta 不保证所有平台、插件和上游版本持续可用。

详细边界见 [安全模型](SECURITY_MODEL.md) 与 [法律说明](LEGAL_NOTICE.md)。
