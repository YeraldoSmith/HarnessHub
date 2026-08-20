# HarnessHub 身份标识体系

状态：Confirmed v0.1

生效日期：2026-08-20

## 1. 设计原则

- 身份标识只陈述身份或职责，不表达插件质量担保；
- 每个标识有唯一名称、授予规则、撤销规则和公开说明；
- Founder、治理角色、开发者验证与插件审核状态相互独立；
- 所有官方标识必须可由用户查看含义，不能依赖颜色区分；
- 授予和撤销操作进入审计日志。

## 2. Founder Badge

显示：**◆ Founder**

规则：

- 仅授予 **YeraldoSmith**；
- 底层唯一绑定为 GitHub 数字 user ID `120692294`，用户名只作为公开展示快照；
- 全平台唯一；
- 不可申请；
- 不可由 Administrator、Moderator 或 Reviewer 转移、复制或撤销；
- 仅代表 HarnessHub 项目创建者身份；
- 不代表任何插件的质量、兼容性或绝对安全。

实现时，Founder 身份由受保护的数据库 bootstrap record、Founder RoleAssignment 和独立 Founder BadgeGrant 建立。权限只读取 RoleAssignment，普通角色管理接口不能创建第二个 Founder；Badge 本身不授予权限。

## 3. Official Badge

显示：**✓ Official**

适用范围：

- HarnessHub 官方账号；
- HarnessHub 官方组织账号。

页面文案必须能让用户理解这里的 “Official” 指 **HarnessHub Official**，不自动表示 DeepSeek、插件作者所属公司或其他第三方的官方身份。

授予：由 Founder 或被明确授权的 Administrator 执行。撤销和组织控制权变化需要记录理由。

## 4. Developer Verification

显示：**✓ Verified Developer**

含义：

- 已通过规定方式验证开发者身份或其对插件来源的控制权；
- 不是 HarnessHub 员工标识；
- 不代表其所有插件绝对安全；
- 不替代版本级来源校验、自动扫描或人工复核。

验证证据可以包括仓库权限、验证文件、GitHub 挑战、npm 包所有权或可验证 provenance。来源控制权失效、账号转移或重大冒充证据出现时可以暂停标识。

## 5. Moderator / Reviewer

显示：

- **◆ Moderator**
- **✓ Reviewer**

Moderator 表示受委任执行社区内容规则；Reviewer 表示受委任执行插件审核和风险复核。两者可以由同一人兼任，但权限分别授予、分别审计。

角色离任、暂停或权限到期后，身份标识必须同步撤销。其历史审核记录保留当时角色快照。

## 6. 组合与展示顺序

一个账号可能同时拥有多个合法标识。默认展示顺序：

1. ◆ Founder
2. ✓ Official
3. ◆ Moderator
4. ✓ Reviewer
5. ✓ Verified Developer

界面空间不足时可以折叠，但不能把多个含义合成一个模糊的 “Verified” 标识。

## 7. 与插件状态的分离

以下属于插件或版本状态，不属于账号身份：

- 来源已验证；
- 自动扫描完成；
- 人工复核；
- 兼容性已声明；
- 兼容性已测试。

账号身份变化不能自动改变历史版本的审核结论；插件通过审核也不能自动授予开发者身份标识。

## 8. 防冒用

- 标识图形和文字只由平台组件生成，用户昵称和简介不得伪造相同视觉；
- 保留 Founder、Official、Moderator、Reviewer 等易混淆名称；
- API 返回结构化 badge code，客户端不根据自由文本推断身份；
- 管理员不可通过直接编辑公开资料绕过授予流程。
