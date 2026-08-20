# HarnessHub Phase 2-B1：GitHub OAuth Implementation

状态：Completed

完成日期：2026-08-20

## 范围

本阶段只实现 GitHub-only OAuth 身份基础。没有实现 Google OAuth、账号绑定 UI、Developer Claim、关注、评论、收藏、支付或安装系统。

后端 callback endpoint 固定为：

```text
GET http://127.0.0.1:3001/auth/github/callback
```

GitHub OAuth App 必须注册完全相同的 callback URL。

## OAuth 流程

### Web

```text
GET /auth/github
  → 创建单次 OAuthTransaction
  → GitHub Authorization Code + PKCE S256 + state
  → GET /auth/github/callback
  → 服务端交换 code 并调用 GitHub /user
  → 用数字 GitHub user ID 解析 OAuthIdentity
  → 创建服务端 Session
  → HttpOnly SameSite=Lax Cookie
  → Web 返回页
```

### Desktop

```text
POST /auth/github/desktop/start
  → 系统浏览器完成同一 GitHub OAuth callback
  → Desktop 用高熵 poll token 查询
POST /auth/github/desktop/exchange
  → 一次性返回 HarnessHub opaque session token
```

桌面端只在当前进程内保存 HarnessHub session token。GitHub access token 不保存到数据库、不写日志、不返回 Web/Desktop；它只用于 callback 中即时读取 `/user`。

## 数据与授权

- `users` 是平台内部主体；
- `oauth_identities` 以 `(provider, issuer, provider_user_id)` 唯一；
- GitHub `login`、display name 与 email 只可展示，不能匹配身份或授权；
- `role_assignments` 是服务端权限事实；
- `user_badge_grants` 只控制公开身份展示；
- `auth_sessions` 只保存 session token 的 SHA-256 摘要；
- `oauth_transactions` 保存 state 摘要及经 AES-256-GCM 加密的 PKCE verifier，并在 callback 时原子消费；
- `audit_events` 记录 bootstrap、身份认证和会话生命周期，不记录 secret、code、verifier 或 token。

Founder migration 预置 GitHub user ID `120692294`，并为同一个内部 User 创建唯一 `FOUNDER` Role 与 `FOUNDER` Badge。数据库部分唯一索引保证全平台最多一个有效 Founder Role 和 Founder Badge。用户名相同、相似或更改都不会授予或移除 Founder。

## API

```text
GET  /auth/github
GET  /auth/github/callback
POST /auth/github/desktop/start
POST /auth/github/desktop/exchange
GET  /auth/session
POST /auth/logout
```

## 环境变量

复制 `.env.example` 为本机 `.env` 并设置：

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://127.0.0.1:3001/auth/github/callback
SESSION_SECRET=
AUTH_WEB_SUCCESS_URL=http://127.0.0.1:5173/?auth=success
```

`SESSION_SECRET` 至少 32 bytes，应使用密码学安全随机值。`.env` 已被 Git 忽略；任何 Secret 都不得提交、复制到前端变量或发到对话中。TTL 变量可沿用 `.env.example` 默认值。

## 验证覆盖

- 普通 GitHub ID 创建 User、OAuthIdentity、USER Role 和 Session；
- Founder 数字 ID 在 username 改名后仍获得 Founder；
- 完全相同和视觉相似用户名在 GitHub ID 不同时不能获得 Founder；
- state 只能消费一次，callback 重放失败；
- Desktop Session 只能交付一次；
- OAuth token/email 不进入 identity metadata，session 明文不进入数据库；
- Web、API、Desktop、Rust 通过构建检查。

真实 GitHub 登录需要部署者在本机 `.env` 配置 OAuth App 凭据后进行最终人工 smoke test；自动测试使用可控 provider adapter，不需要真实 Secret。
