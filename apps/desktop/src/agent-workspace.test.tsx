import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'

import { AgentWorkspace } from './agent-workspace.js'

const runtime: RuntimeSnapshot = {
  runtimeId: 'dsh-agent-workspace-fixture',
  runtimeName: 'DSH',
  implementation: 'CONTRACT_FIXTURE',
  version: '0.1.0-fixture.1',
  status: 'RUNNING',
  connection: 'CONNECTED',
  generation: 1,
  updatedAt: '2026-08-20T08:00:00.000Z',
}

const event: RuntimeEvent = {
  schemaVersion: 1,
  id: 'agent-ready-event',
  runtimeId: runtime.runtimeId,
  generation: 1,
  sequence: 1,
  kind: 'AGENT_READY',
  status: 'RUNNING',
  timestamp: '2026-08-20T08:00:00.000Z',
  message: 'Agent Ready',
}

describe('Agent Workspace Beta entry', () => {
  it('shows Runtime, conversation, task, activity, and the non-execution boundary', () => {
    const markup = renderToStaticMarkup(
      <AgentWorkspace environment={null} events={[event]} runtime={runtime} />,
    )

    expect(markup).toContain('Agent 工作区')
    expect(markup).toContain('Conversation Workspace')
    expect(markup).toContain('任务状态')
    expect(markup).toContain('Agent 已就绪')
    expect(markup).toContain('不会触发模型、Agent、Shell 或插件代码')
    expect(markup).toContain('disabled=""')
  })
})
