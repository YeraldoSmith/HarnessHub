# Developer Trust Foundation

状态：Phase 2-C 已实现

## 1. 信任边界

GitHub 登录只证明一个稳定的 GitHub 数字 user ID 对应当前 HarnessHub 用户。它不自动证明该用户可以代表某个插件。

插件管理资格来自独立的 `PluginOwnership`。首个 `OWNER` 必须完成服务器验证的 GitHub 仓库挑战；前端提交的用户名、作者名、仓库 owner login 或 verified 状态都不是授权事实。

```text
User + OAuthIdentity(GitHub numeric ID)
  -> DeveloperProfile
  -> DeveloperClaim
  -> immutable VerificationEvidence
  -> PluginOwnership
  -> Developer role + Verified Developer badge
```

## 2. 首版认领流程

1. 已登录用户创建 Developer Profile。
2. 用户选择 Registry 中已有且带公开 GitHub 来源的插件。
3. 后端读取 GitHub 仓库并固定数字 repository ID、数字 owner ID、owner 类型、canonical URL 和 default branch。
4. 后端生成一次性 nonce，只在发起认领响应中返回明文；数据库仅保存 SHA-256 摘要。
5. 开发者把精确内容提交到默认分支的 `.harnesshub/claims/<claim-id>.txt`。
6. 后端从 canonical public repository 读取该文件，核对内容摘要，并记录最后修改该路径的 commit SHA。
7. 一个串行化事务创建不可变 Evidence、唯一 OWNER、Developer Role、Verified Developer Badge 和 Audit Event。

挑战默认 24 小时过期，可通过 `DEVELOPER_CLAIM_TTL_SECONDS` 在 5 分钟到 7 天之间配置。

## 3. GitHub 验证范围

Phase 2-C 不扩大登录 OAuth scope，也不保存 GitHub access token。首版只验证公开仓库：能把随机、短期、不可预测的证明文件写入 canonical default branch，表示提交者具备直接写入或通过该仓库维护流程合并变更的能力。

这是一种仓库控制权证明，不是对 GitHub 用户名的比较。组织仓库记录 GitHub 的稳定 organization numeric ID，未来可在不改变 Ownership 模型的前提下扩展 GitHub App、团队和细粒度权限验证。

私有仓库、直接读取 collaborator 权限和组织 team membership 推迟到 fine-grained GitHub App 方案；不得通过扩大登录 OAuth App 权限临时绕过。

## 4. 数据模型

- `DeveloperProfile`：普通 User 可选的开发者公开资料；`verificationStatus` 仅服务端可写。
- `DeveloperClaim`：一次认领尝试，绑定 User、OAuthIdentity、Plugin、稳定仓库事实和挑战摘要。
- `PluginOwnership`：服务端授权事实。首版每个插件最多一个未撤销 `OWNER`；模型预留 Maintainer、Team Member 和 Organization Delegate。
- `VerificationEvidence`：成功验证观察记录，包含稳定来源 ID、commit SHA、blob SHA、路径、分支和观察时间；数据库禁止更新与删除。
- `AuditEvent`：记录 Profile 创建/修改、Claim 创建/失败/批准和 Ownership 授予。

历史 Claim 与 Evidence 不因上游仓库失效而删除。

## 5. API

所有接口需要有效 Web HttpOnly Session Cookie 或 Desktop opaque Bearer Session：

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/developer/me` | 当前用户的 Profile、Claims 与 Ownerships |
| `PUT` | `/developer/me` | 创建或更新公开 Developer Profile |
| `GET` | `/developer/claims` | 当前用户的 Claim 历史 |
| `POST` | `/developer/claims` | 为 Registry Plugin 发起一次 Claim |
| `POST` | `/developer/claims/:claimId/verify` | 验证仓库挑战并授予 Ownership |

客户端不能指定 `user_id`、`verification_status`、Role、Badge、Ownership 或 Evidence。

## 6. Verified Developer

获得条件：

- 具有有效 GitHub OAuthIdentity；
- 至少一个仓库挑战成功并形成有效 PluginOwnership；
- DeveloperProfile 未被限制。

`DEVELOPER` Role 是服务端权限事实；`VERIFIED_DEVELOPER` Badge 是公开信任标识。Badge 本身不产生权限，不代表平台员工身份，也不保证该开发者的所有插件或任一版本绝对安全。

严重违规、撤销、转移和团队成员管理已在数据模型中预留，但管理后台不属于 Phase 2-C。

## 7. 明确不含

本阶段没有插件上传、自动发布、安装、评论、评分、关注、支付、Bounty、Google OAuth 或完整审核后台。认领只为 Registry 里已有插件建立可信归属。
