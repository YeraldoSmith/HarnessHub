import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { permissionReviewAgentManifest } from '@harnesshub/installation-prototype'
import type { AuthSessionResponse } from '@harnesshub/types'

import { InstallationPermissionReview, InstallationPrototypePanel } from './installation-prototype.js'

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
})
