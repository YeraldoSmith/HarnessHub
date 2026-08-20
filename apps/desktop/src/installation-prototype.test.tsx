import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { permissionReviewAgentManifest } from '@harnesshub/installation-prototype'
import { ControlledDshAdapter, normalizeRuntimeSnapshot } from '@harnesshub/runtime-integration'
import type { AuthSessionResponse } from '@harnesshub/types'

import { InstallationPermissionReview, InstallationPrototypePanel } from './installation-prototype.js'
import { RuntimeSetupPlanReview } from './runtime-integration.js'

describe('installation permission review UI', () => {
  it('shows user-friendly Chinese permission and risk descriptions', () => {
    const markup = renderToStaticMarkup(
      <InstallationPermissionReview manifest={permissionReviewAgentManifest} />,
    )

    expect(markup).toContain('网络访问')
    expect(markup).toContain('读取项目文件')
    expect(markup).toContain('安装时执行第三方代码')
    expect(markup).toContain('风险等级')
    expect(markup).toContain('中等')
    expect(markup).toContain('本演示仅展示警告，不会执行')
    expect(markup).not.toContain('allowBuilds=true')
  })

  it('blocks unauthenticated users before a transaction can be created', () => {
    const auth: AuthSessionResponse = { authenticated: false }
    const markup = renderToStaticMarkup(<InstallationPrototypePanel auth={auth} />)

    expect(markup).toContain('模拟结果不代表插件已真实安装')
    expect(markup).toContain('登录后开始模拟')
    expect(markup).not.toContain('确认模拟安装')
  })

  it('shows every future setup permission while keeping all steps non-executable', () => {
    const environment = normalizeRuntimeSnapshot({
      id: 'runtime-ui-test',
      platform: 'macOS',
      architecture: 'aarch64',
      node: { name: 'Node.js', status: 'AVAILABLE', versionOutput: 'v22.19.0', probe: 'FIXED_VERSION_ARGUMENT', readOnly: true },
      pnpm: { name: 'pnpm', status: 'AVAILABLE', versionOutput: '11.19.0', probe: 'FIXED_VERSION_ARGUMENT', readOnly: true },
      git: { name: 'Git', status: 'AVAILABLE', versionOutput: 'git version 2.51.0', probe: 'FIXED_VERSION_ARGUMENT', readOnly: true },
      dsh: { name: 'DSH', status: 'MISSING', versionOutput: null, probe: 'FIXED_VERSION_ARGUMENT', readOnly: true },
      managedToolchainReady: false,
      capturedAtUnixMs: Date.parse('2026-08-20T00:00:00.000Z'),
      readOnly: true,
      systemMutationAllowed: false,
    })
    const plan = new ControlledDshAdapter(
      () => new Date('2026-08-20T00:00:00.000Z'),
      () => 'setup-ui-test',
    ).prepareInstallPlan(environment)
    const markup = renderToStaticMarkup(<RuntimeSetupPlanReview plan={plan} />)

    expect(markup).toContain('下载经过批准的 DSH')
    expect(markup).toContain('写入用户 Profile')
    expect(markup).toContain('运行受控验证程序')
    expect(markup).toContain('当前不可执行')
    expect(markup).toContain('不会执行')
    expect(markup).toContain('不会下载或安装任何软件')
    expect(markup).toContain('不会执行 Shell、脚本或第三方代码')
    expect(markup).toContain('不会修改 PATH、系统设置或现有文件')
  })
})
