# HarnessHub Managed Runtime and Installation

状态：Beta 实现

更新时间：2026-08-20

## 已实现范围

HarnessHub Desktop 现在提供真实、受控的本地 DSH 管理闭环：

```text
明确确认
  -> 固定官方 DSH 版本
  -> HarnessHub 隔离 DSH_HOME
  -> web Profile 配置验证
  -> Registry npm 完整性复核
  -> 固定插件版本安装 / 更新 / 卸载
  -> DSH 配置复核
  -> 本地只追加审计
```

DSH 固定为 `@deepseek-ai/dsh@0.1.0-rc.8`。执行器使用已经过真实冒烟验证的 `pnpm dlx`，不经过 Shell，也不接受用户提供的命令、可执行路径或额外参数。

## 隔离边界

- 首次准备不依赖系统 Node.js、pnpm 或 DSH；系统探测结果只用于展示；
- HarnessHub 下载固定版本 Node.js `22.19.0`，按平台校验 Node.js 官方 `SHASUMS256.txt` 中的 SHA-256，并进行防路径穿越解压；
- 使用 Node.js 自带 npm，在隔离前缀中准备固定版本 pnpm `11.19.0`；安装前必须匹配内置 npm `sha512` 完整性证据，且禁用脚本；
- DSH `0.1.0-rc.8` 下载前同样必须匹配内置 npm `sha512` 完整性证据；包管理器还会验证所有下载内容的 Registry 完整性；
- 工具链、npm 缓存、pnpm Store 与配置全部保存在 Tauri `app_local_data_dir/managed-runtime/toolchain`；
- DSH 数据写入 Tauri `app_local_data_dir/managed-runtime/dsh-home`；
- 使用官方 `web` Profile，但不读取或修改用户现有的 `$DSH_HOME`；
- 不修改 PATH、Shell 配置、系统设置或全局 npm/pnpm 安装；
- Runtime 只监听系统分配的随机 `127.0.0.1` 端口；
- HarnessHub 启动时设置 `DSH_TELEMETRY_DISABLED=1`；
- 安装与卸载均设置 npm/pnpm `ignore_scripts=true`；
- Runtime 日志、插件状态和审计保存在 HarnessHub 应用数据目录。

Runtime 准备不会运行用户 Shell，不会读取用户 npmrc，不会修改全局 PATH，也不会调用系统 Node.js/pnpm 执行 DSH。当前内置 Node.js 下载清单覆盖 macOS、Windows、Linux 的 arm64 与 x64 架构，以及 Windows x86；其他架构会在下载前明确停止。

## 插件准入

原生层允许用户安装具有完整、不可变来源证据的插件；登录不是本地安装的前提。npm
来源必须有固定精确版本及 `sha512` 完整性证据；GitHub 来源必须使用规范
`https://github.com/<owner>/<repo>` 地址和 40 位固定 commit。任何来源都必须完成
Runtime 准备并经过明确用户确认。

自动发现、未验证、High 或 Critical 风险插件会要求两次独立确认。未验证不代表
禁止安装，也不代表已经安全；HarnessHub 不执行静默安装。

安装 npm 插件前，原生层通过固定参数 `pnpm view <package>@<version> dist.integrity --json` 重新获取当前完整性值，必须与 Registry 快照完全一致。GitHub 插件使用固定 commit URL，不允许浮动分支或 tag。之后由 HarnessHub 受控的 pnpm 在隔离 Profile 中执行：

```text
pnpm --dir <isolated-profile>
  add --save-exact --ignore-scripts <allowlisted-package>@<pinned-version>
```

只有本地包清单确认真实包名、固定版本及 `dsh.bundle.patch` 后，HarnessHub 才将 bundle 写入 Profile。更新复用同一固定版本路径，不使用浮动 `latest`。卸载先移除 bundle 层、再运行受控 pnpm `remove --ignore-scripts`，因此损坏或缺失的依赖不会阻止用户恢复 Runtime。

## 恢复与验证

执行前保存 Profile 的 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` 与 `cordis.patch.yml`。失败时恢复这些受管文件并用禁脚本 pnpm 重新对齐依赖，并明确记录 `ROLLED_BACK` 或 `RECOVERY_REQUIRED`，不会将部分成功显示成安装完成。

安装完成后必须运行固定的 `web --dump-config`。只有命令成功、配置可解析并保存安装状态后，UI 才显示已安装。

每次启动前还会执行一次受控一致性检查：只有已记录的固定版本、npm 完整性证据或 GitHub commit 仍然可验证的插件，才允许补齐 Profile 中缺失的依赖。检查失败时 Runtime 保持停止并记录 `REPAIR_PLUGIN` 失败，而不会伪装成启动成功。

## Runtime 生命周期

Desktop 可以：

- 查询准备状态和已安装插件；
- 启动一个真实本地 DSH web Runtime；
- 等待随机回环端口通过就绪检查；
- 在 HarnessHub 受控应用窗口中打开 DSH 官方本地工作区；
- 优先发送 `SIGTERM` 停止，超时后才强制终止；
- 将启动、停止、失败写入本地审计。

HarnessHub 不把任意 Agent 请求直接透传为系统命令。会话、模型凭据、Agent 工具和权限确认继续由 DSH 工作区负责。

## 登录与产品页面

- Desktop OAuth opaque Session 保存在操作系统安全凭据存储中；
- 启动时使用 `/auth/session` 重新验证，失效会话会从凭据存储删除；
- Tasks 展示本地只追加操作审计；
- Account 展示稳定 GitHub ID、Role/Badge 和登出入口；
- Settings 提供独立的常规、外观（系统/浅色/深色）和关于页面；关于页包含 `Created by YeraldoSmith · Copyright © 2026 YeraldoSmith` 与软件条款；
- 初始支持简体中文、English、日本語、한국어和 Español；第三方插件原始内容不被改写，未翻译的界面项按默认语言安全回退；
- DSH 工作区负责模型连接和 API Key 设置；HarnessHub 不读取、上传或写入 API Key。

## 真实冒烟验证

在一次性 `/tmp` 隔离目录中完成：

- `pnpm dlx @deepseek-ai/dsh@0.1.0-rc.8 web --dump-config`；
- `dsh-workbench@0.8.0` 固定版本、禁脚本安装；
- 安装后的 DSH 配置解析；
- DSH web 在 `127.0.0.1:43177` 启动并返回 HTTP 200；
- 禁脚本卸载成功。

测试目录不包含用户现有 DSH 配置，也没有调用模型或执行 Agent 任务。

## 明确未伪装完成的部分

- 当前 macOS Beta 包使用本地 ad-hoc 签名并已通过 `codesign --verify --deep --strict`；正式公开分发仍需 Apple Developer ID 签名与公证；
- HarnessHub 不代替 DSH 保存模型 API Key；
- Agent 输入仍不从 HarnessHub 直接提交，用户进入 DSH 官方本地工作区继续；
- 第三方插件安全扫描尚未覆盖，因此当前“可安装”只代表来源、固定版本和完整性证据满足受控边界，不代表绝对安全；
- Windows/Linux 原生生命周期仍需独立打包冒烟验证。
