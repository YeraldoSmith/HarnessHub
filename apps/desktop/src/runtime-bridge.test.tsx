import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  ContractDshRuntimeFixture,
  DSHRuntimeBridge,
  type RuntimeSnapshot,
} from '@harnesshub/runtime-bridge'

import { RuntimeBridgeView } from './runtime-bridge.js'

const initialSnapshot: RuntimeSnapshot = {
  runtimeId: 'dsh-fixture-ui',
  runtimeName: 'DSH',
  implementation: 'CONTRACT_FIXTURE',
  version: '0.1.0-fixture.1',
  status: 'NOT_RUNNING',
  connection: 'CONNECTED',
  generation: 1,
  updatedAt: '2026-08-20T08:00:00.000Z',
}

describe('Runtime Bridge Desktop UI', () => {
  it('shows a clear Fixture boundary and start/stop controls', () => {
    const markup = renderToStaticMarkup(
      <RuntimeBridgeView
        auditCount={1}
        error=""
        events={[]}
        onReconnect={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
        pending={false}
        showDevelopmentDetails
        snapshot={initialSnapshot}
      />,
    )

    expect(markup).toContain('Agent Runtime')
    expect(markup).toContain('当前连接的是测试 Runtime，不是真实 DSH')
    expect(markup).toContain('启动')
    expect(markup).toContain('停止')
    expect(markup).toContain('0.1.0-fixture.1')
    expect(markup).not.toContain('发送请求')
  })

  it('hides fixture terminology in the normal Beta experience', () => {
    const markup = renderToStaticMarkup(
      <RuntimeBridgeView
        auditCount={0}
        error=""
        events={[]}
        onReconnect={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
        pending={false}
        snapshot={initialSnapshot}
      />,
    )
    const visibleText = markup.replace(/<[^>]+>/g, ' ')

    expect(markup).toContain('安全预览')
    expect(markup).toContain('Beta 预览')
    expect(visibleText).not.toContain('Fixture')
    expect(visibleText).not.toContain('fixture')
  })

  it('keeps the real Runtime start action disabled until setup is complete', () => {
    const markup = renderToStaticMarkup(
      <RuntimeBridgeView
        auditCount={0}
        error=""
        events={[]}
        onReconnect={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
        pending={false}
        runtimeReady={false}
        snapshot={{ ...initialSnapshot, implementation: 'LOCAL_DSH' }}
      />,
    )

    expect(markup).toMatch(/<button disabled=""[^>]*>启动<\/button>/)
    expect(markup).toContain('启动本地 Runtime 后，这里会显示经过校验的运行事件。')
    expect(markup).not.toContain('runtimeBridge.noRealEvents')
  })

  it('keeps Start available after a prepared local Runtime has stopped', () => {
    const markup = renderToStaticMarkup(
      <RuntimeBridgeView
        auditCount={0}
        error=""
        events={[]}
        onReconnect={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
        pending={false}
        runtimeReady
        snapshot={{
          ...initialSnapshot,
          implementation: 'LOCAL_DSH',
          runtimeId: 'harnesshub-local-dsh',
          connection: 'DISCONNECTED',
        }}
      />,
    )

    expect(markup).toMatch(/<button[^>]*>启动<\/button>/)
    expect(markup).toContain('重新连接')
    expect(markup).toMatch(/<button disabled=""[^>]*>停止<\/button>/)
  })

  it('renders validated runtime events after the Fixture starts', async () => {
    let value = 0
    const fixture = new ContractDshRuntimeFixture({
      id: () => `ui-${++value}`,
      now: () => new Date('2026-08-20T08:00:00.000Z'),
      port: () => 54321,
      wait: async () => undefined,
    })
    const bridge = new DSHRuntimeBridge(fixture, {
      id: () => `audit-${++value}`,
      now: () => new Date('2026-08-20T08:00:00.000Z'),
    })
    await bridge.connect()
    await bridge.start()

    const markup = renderToStaticMarkup(
      <RuntimeBridgeView
        auditCount={bridge.auditEvents().length}
        error=""
        events={bridge.events()}
        onReconnect={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
        pending={false}
        showDevelopmentDetails
        snapshot={bridge.snapshot()}
      />,
    )

    expect(markup).toContain('运行中')
    expect(markup).toContain('Runtime 已启动')
    expect(markup).toContain('Agent 已就绪')
    expect(markup).toContain('已连接')
  })
})
