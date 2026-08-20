import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { translate } from '@harnesshub/i18n'
import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'

import { WorkspaceDashboard, WorkspaceSidebar } from './workspace-shell.js'

const runtime: RuntimeSnapshot = {
  runtimeId: 'dsh-fixture-workspace',
  runtimeName: 'DSH',
  implementation: 'CONTRACT_FIXTURE',
  version: '0.1.0-fixture.1',
  status: 'RUNNING',
  connection: 'CONNECTED',
  generation: 1,
  updatedAt: '2026-08-20T08:00:00.000Z',
}

const runtimeStarted: RuntimeEvent = {
  schemaVersion: 1,
  id: 'runtime-event-workspace',
  runtimeId: runtime.runtimeId,
  generation: 1,
  sequence: 1,
  kind: 'RUNTIME_STARTED',
  status: 'RUNNING',
  timestamp: '2026-08-20T08:00:00.000Z',
  message: 'Runtime Started',
}

describe('Desktop workspace shell', () => {
  it('renders the expandable navigation structure with a current page', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSidebar active="runtime" onNavigate={() => undefined} runtimeConnected />,
    )

    expect(markup).toContain('首页')
    expect(markup).toContain('插件')
    expect(markup).toContain('Agent')
    expect(markup).toContain('Runtime')
    expect(markup).toContain('任务')
    expect(markup).toContain('账户')
    expect(markup).toContain('设置')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('本地 Runtime')
  })

  it('makes Runtime, DSH, plugins, and recent activity visible on first open', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceDashboard
        environment={null}
        onNavigate={() => undefined}
        plugin={null}
        runtime={runtime}
        runtimeEvents={[runtimeStarted]}
      />,
    )

    expect(markup).toContain('你的 AI Agent 工作台')
    expect(markup).toContain('Runtime 状态')
    expect(markup).toContain('DSH 环境')
    expect(markup).toContain('插件入口')
    expect(markup).toContain('Runtime 已启动')
    expect(markup).toContain('仅本机')
  })

  it('keeps the new workspace copy available in English', () => {
    expect(translate('en-US', 'dashboard.title')).toBe('Your AI Agent workspace')
    expect(translate('en-US', 'nav.settings')).toBe('Settings')
  })
})
