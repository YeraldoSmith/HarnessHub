# HarnessHub 使用说明 / User Guide

状态：Public Beta
更新：2026-08-21

## 1. 选择正确的安装包

从 GitHub Releases 下载与设备一致的文件：

- **Windows x64**：大多数 Intel/AMD 64 位 Windows 电脑；
- **Windows ARM64**：Snapdragon 等 ARM Windows 电脑；
- **Windows x86**：仅旧的 32 位 Windows 电脑；
- **Linux x64/ARM64**：选择与 `uname -m` 对应的 `.deb` 或 `.AppImage`；
- **macOS Apple Silicon**：M 系列芯片的 `.dmg`。

首次运行如出现系统安全提示，请只从官方 GitHub Release 获取文件，并核对发布页
的版本与说明。未签名或未公证的 Beta 包可能需要系统额外确认；不要从未知镜像、
聊天附件或第三方下载站获取安装包。

## 2. 浏览插件

无需登录即可：

1. 打开 **Plugins / 插件**；
2. 按名称、描述、作者、标签或分类搜索；
3. 在详情页查看来源、版本、许可证、兼容性、Snapshot、权限和风险信息；
4. 对公开收录插件，留意“未验证安全”或风险提示。

`来源已收录` 只表示 HarnessHub 记录了公开来源。它不表示平台、DSH、GitHub 或
任何作者保证该插件安全。

## 3. 准备本地 DSH Runtime

1. 打开 **Runtime**；
2. 选择 **Prepare Runtime / 准备 Runtime**；
3. 阅读固定版本、完整性校验、隔离目录和不会执行的操作；
4. 确认后等待准备完成；
5. 选择 **Start / 启动**，再从 Agent Workspace 打开本地 DSH 工作区。

HarnessHub 会在自己的应用数据目录创建隔离工具链与 Profile。它不会要求你先
安装 Node.js 或 pnpm，也不会修改全局 PATH、Shell 配置、系统 Node 或已有
`DSH_HOME`。DSH 工作区中的模型设置、API Key、Agent 行为和工具授权仍由 DSH
负责；HarnessHub 不读取或上传你的 API Key。

## 4. 安装插件

安装前请逐项确认：

1. 来源 URL 是否是你愿意信任的项目；
2. 版本是否固定，GitHub 来源是否固定到 commit；
3. 权限、风险等级、兼容性和许可证是否可接受；
4. 本机 Runtime 是否已准备完成；
5. 安装确认页说明的操作是否与你的意图一致。

所有插件都可由用户自行决定安装；未验证、High 或 Critical 风险来源会要求两次
明确确认。两次确认不是安全保证，也不是建议忽略风险。HarnessHub 使用隔离
Profile、固定版本与禁用 lifecycle scripts 的受控路径，但第三方插件在 Runtime
中的实际能力仍可能影响数据、网络、文件或外部服务。

## 5. 更新、卸载与故障恢复

- 更新前重新审查版本、来源、权限和风险变化；
- 卸载只删除 HarnessHub 受管的插件和 Profile 配置，不主动删除未知用户数据；
- 操作失败时查看 **Tasks / 任务** 的本地审计记录；
- 显示 `ROLLED_BACK` 表示已回滚受管文件；`RECOVERY_REQUIRED` 表示恢复未完成，
  不应继续假定环境正常；
- Runtime 启动失败时停止 Runtime、查看本地日志，并不要反复强制安装同一插件。

## 6. 登录是可选的

GitHub 登录仅用于账号身份、云端同步、多设备、开发者功能、徽章和未来社区能力。
不登录不会阻止你浏览公开插件、准备本地 DSH Runtime 或执行本地插件操作。

## 7. 反馈安全问题

不要在公开 issue 中发布真实密钥、可被直接利用的漏洞细节或私人日志。请使用仓库
的 GitHub 私密安全报告渠道；如该渠道尚未启用，请先创建最小化的公开 issue，
不要附带敏感细节，并要求维护者提供安全联络方式。
