# HarnessHub

> **Community Marketplace for AI Agent Plugins**
> **面向 AI Agent 插件生态的社区型市场平台**

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](LICENSE)

HarnessHub is a local-first desktop hub for discovering AI Agent plugins and
preparing a controlled local DeepSeek Harness (DSH) Runtime. It begins with the
DSH ecosystem while keeping the Registry, Runtime Bridge, and trust model
adaptable to other runtimes in the future.

HarnessHub 是一个本地优先的桌面工作台：用于发现 AI Agent 插件、审查来源和
风险信息，并在隔离环境中准备本地 DSH Runtime。

Created by **YeraldoSmith** · Founder & Initial Maintainer
Copyright © 2026 YeraldoSmith

## What users can do / 可以做什么

- Browse, search, filter, and inspect plugin source, version, compatibility,
  license, snapshot, permissions, and risk information.
- Use the Desktop app as a guest: browsing, preparing the pinned local DSH
  Runtime, and local plugin operations do not require a GitHub account.
- Prepare an isolated, fixed-version Node.js/pnpm/DSH toolchain without editing
  the global `PATH`, shell configuration, or an existing `DSH_HOME`.
- Start and stop the local DSH web Runtime from HarnessHub and open its local
  workspace in a managed app window.
- Install, update, remove, and recover managed plugin records through explicit
  confirmations, pinned versions, integrity evidence, disabled lifecycle
  scripts, and a local append-only audit trail.

登录只用于身份、同步、多设备、开发者功能与徽章等增强能力；它不是基础使用门槛。

## Safety model / 安全模型

HarnessHub does **not** claim that third-party plugins are safe. Source
collection, a visible badge, a risk label, a version pin, or a completed
installation is not a security guarantee.

- Every installation requires user confirmation.
- Automatically collected, unverified, high-risk, and critical-risk candidates
  require two explicit confirmations; none are executed silently.
- GitHub dependencies are pinned to a commit; npm dependencies are pinned to an
  exact version and integrity evidence when available.
- Package lifecycle scripts are disabled by the managed installer.

Read [the security model](docs/SECURITY_MODEL.md),
[installation boundary](docs/MANAGED_RUNTIME_AND_INSTALLATION.md), and
[legal notice](docs/LEGAL_NOTICE.md) before using third-party plugins.

## Releases / 安装包

Download Desktop installers from [GitHub Releases](../../releases). The release
pipeline builds these native targets:

| Platform | Architecture | Package formats |
| --- | --- | --- |
| Windows | x86, x64, ARM64 | `.exe` |
| Linux | x64, ARM64 | `.deb`, `.AppImage` |

Windows and Linux installers are built and uploaded only by the native CI
pipeline. See [Desktop packaging](docs/DESKTOP_PACKAGING.md).

## Quick start / 快速开始

1. Download the installer matching your operating system and CPU architecture.
2. Open **Runtime** in HarnessHub and choose **Prepare Runtime**.
3. Review the fixed versions, download hashes, isolated-profile explanation,
   and operations that will *not* be performed; confirm only if you agree.
4. Start the Runtime after preparation succeeds, then open the local Agent
   Workspace.
5. In **Plugins**, inspect a plugin's source, version, permissions, risk and
   evidence before confirming an installation.

For detailed local-user and developer instructions, see
[User Guide](docs/USER_GUIDE.md) and [Developer Guide](docs/DEVELOPER_GUIDE.md).

## Development / 本地开发

Requirements: Node.js 22.19+, pnpm 11, PostgreSQL 17, and Rust for Desktop.

```bash
pnpm install
pnpm db:local:start
pnpm db:migrate
pnpm registry:sync
pnpm dev
```

For GitHub OAuth, copy `.env.example` to `.env` and provide server-only values.
Never commit `.env`, OAuth client secrets, session secrets, or GitHub tokens.

```bash
pnpm check
pnpm test:integration
```

## Documentation

- [Product overview](docs/PRODUCT_OVERVIEW.md)
- [User guide](docs/USER_GUIDE.md)
- [Legal notice and Beta disclaimers](docs/LEGAL_NOTICE.md)
- [Privacy and data handling](docs/PRIVACY_AND_DATA.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Community guidelines](docs/COMMUNITY_GUIDELINES.md)
- [Developer guide](docs/DEVELOPER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Founding principles](docs/FOUNDING_PRINCIPLES.md)

## License and copyright

Source code and official project assets in this repository are licensed under
the [GNU Affero General Public License v3.0 or later](LICENSE), unless a file
states otherwise. The copyright holder is YeraldoSmith.

Third-party plugins, brands, documentation, and user content remain the
property of their respective authors and rightsholders. Their presence in a
Registry or release does not transfer ownership to HarnessHub or constitute an
endorsement.
