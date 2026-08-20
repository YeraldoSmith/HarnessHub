# Beta Marketplace Sources

HarnessHub Beta uses a manually curated allowlist. It does not scan GitHub automatically and does not treat npm publication as a safety review.

On 2026-08-20, each entry below was cross-checked against the npm package manifest and the corresponding GitHub repository root `package.json`. The package name, repository identity, license declaration, and non-empty `dsh.bundle.patch` were required to match before inclusion.

| Plugin | npm package | GitHub source | Category |
| --- | --- | --- | --- |
| Cline Free Models Provider | `@jiesou/dsh-cline-free-provider` | `jiesou/dsh-cline-free-provider` | Developer Tools |
| DSH Agent Teams | `@nanmicoder/dsh-agent-teams` | `NanmiCoder/dsh-agent-teams` | Automation |
| dsh-TUI | `@deepseek-harness-tui/dsh-tui` | `ccch1mneyyy/dsh-TUI` | Developer Tools |
| DSH Tool Vision | `@aalongaa/dsh-tool-vision` | `AaLonG-2012/dsh-tool-vision` | Research |
| DSH Side Chat | `@ahggg/dsh-side-chat` | `AHGGG/dsh-side-chat` | Productivity |
| DSH Turn Rewind | `@anionex/dsh-turn-rewind` | `Anionex/dsh-turn-rewind` | Developer Tools |
| DSH Vision Toolkit | `@anionex/dsh-vision-toolkit` | `Anionex/dsh-vision-toolkit` | Research |
| AWiki for DSH | `@awiki/dsh-plugin` | `AgentConnect/dsh-awiki` | Productivity |
| SkillHub for DSH | `@cocofhu/skillhub` | `cocofhu/skillhub` | Productivity |
| Unified Agent Memory | `dsh-unified-agent-memory` | `Noelune/unified-agent-memory` | Research |
| DSH Univer Office | `dsh-univer-office` | `dream-num/dsh-univer-office` | Productivity |
| DSH Update Checker | `dsh-update-checker` | `Airmetro/dsh-update-checker` | Developer Tools |
| DSH Update Copilot | `dsh-update-copilot` | `hezhongtang/dsh-update-copilot` | Developer Tools |
| DSH Usage Stats | `dsh-usage-stats` | `lanlandeli/dsh-usage-stats` | Data |
| DSH Vault | `dsh-vault` | `Ox0400/dsh-vault` | Developer Tools |
| DSH Vision Router | `dsh-vision-router` | `ysr666/dsh-vision-router` | Research |
| DSH Weixin Gateway | `dsh-weixin-gateway` | `shaodushu/dsh-weixin-gateway` | Automation |
| DSH with Pencil | `dsh-with-pencil` | `IWAIBAOLI/dsh-with-pencil` | Productivity |
| DSH Workbench | `dsh-workbench` | `lee259/dsh-workbench` | Coding |
| Pi to DSH Bridge | `pi2dsh` | `weijiafu14/pi2dsh` | Developer Tools |

## Trust boundary

- “Source verified” means the current GitHub and npm identities were cross-checked and evidence was saved.
- It does not mean “Verified Developer,” “safe to install,” or “approved by HarnessHub.”
- Plugins without completed permission analysis display `Risk pending`; they are never silently classified as low risk.
- Downloads remain a reserved display field until HarnessHub has a real, privacy-preserving measurement source.
