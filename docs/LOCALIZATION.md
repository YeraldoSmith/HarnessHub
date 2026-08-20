# HarnessHub Localization Foundation

状态：Phase 2-B1.5 Completed

完成日期：2026-08-20

## 目标与边界

HarnessHub 初始支持：

```text
zh-CN（默认）
en-US
```

本阶段只建立语言层抽象，没有修改 Registry 数据模型、OAuth 流程、插件来源、身份授权或页面结构，也没有引入语言管理后台。

## 共享架构

`packages/i18n` 是 Web、Tauri Desktop 和 `packages/ui` 的唯一界面翻译来源：

```text
packages/i18n/
├── src/locales/zh-CN.json
├── src/locales/en-US.json
├── src/core.ts       # locale 规范化、检测、翻译、参数插值
├── src/react.tsx     # I18nProvider、useI18n、LanguageSelect
└── src/core.test.ts
```

规则：

- 新增用户界面文字时必须先增加语义化 translation key，再通过 `t(key)` 使用；
- `zh-CN` 是 fallback 和首次访问默认语言；
- 手动选择存入本机 `localStorage` 的 `harnesshub.locale`，不上传服务器；
- 已提供 `detectSystemLocale()`，但本阶段不自动覆盖“默认中文”原则；
- 两个 JSON 必须保持完全相同的 key 集合，测试会阻止缺失翻译；
- 参数使用 `{{name}}` 形式，不拼接可变句子；
- 页面 `<html lang>` 跟随当前语言更新。

## 翻译与不翻译

已抽离：导航、登录/退出、搜索、分页、空状态、错误状态、语言选择、Web 首页说明、Desktop 壳、插件事实字段、来源状态、Snapshot/证据提示与身份 Badge。

以下第三方作者资产保持原样：

- 插件名称、描述、分类与标签；
- README、发布说明；
- 开发者名称和其提供的权限说明。

技术字段采用中文优先并保留必要英文，例如“版本 Version”“提交 Commit SHA”“许可证 License”“快照 Snapshot”。GitHub、npm、DSH、版本号、commit hash、许可证标识和来源证据值不翻译。

## 使用示例

```tsx
const { t } = useI18n()

<button>{t('auth.signIn')}</button>
<span>{t('web.pageSummary', { page, total })}</span>
```

禁止重新写成硬编码界面文案。内部枚举、API path、日志键和第三方数据不属于翻译资源。

## 后续扩展

- 可在产品确认后用 `detectSystemLocale()` 作为首次访问策略；
- 新语言必须先复制完整 key 集合并通过 parity test；
- 长篇插件内容是否机器翻译需要单独的作者权利、准确性与产品评审，不能自动进入当前 UI 翻译层；
- 不在 Phase 2-B1.5 引入服务端 locale、账号同步或翻译管理后台。
