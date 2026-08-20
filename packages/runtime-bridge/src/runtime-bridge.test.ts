import { describe, expect, it } from 'vitest'

import {
  ContractDshRuntimeFixture,
  RuntimeAuthorizationError,
} from './contract-fixture.js'
import { DSHRuntimeBridge, RuntimeBridgeConnectionError } from './dsh-runtime-bridge.js'

function harness() {
  let value = 0
  const id = () => `test-${++value}`
  const fixture = new ContractDshRuntimeFixture({
    id,
    now: () => new Date('2026-08-20T08:00:00.000Z'),
    port: () => 54321,
    wait: async () => undefined,
  })
  const bridge = new DSHRuntimeBridge(fixture, {
    id,
    now: () => new Date('2026-08-20T08:00:00.000Z'),
  })
  return { bridge, fixture }
}

describe('DSH Runtime Bridge contract fixture', () => {
  it('connects, starts, reports health, and stops without a real Runtime', async () => {
    const { bridge } = harness()
    const observed: string[] = []
    bridge.subscribe((snapshot) => observed.push(snapshot.status))

    await bridge.connect()
    expect(bridge.snapshot().connection).toBe('CONNECTED')
    expect(bridge.snapshot().implementation).toBe('CONTRACT_FIXTURE')

    const running = await bridge.start()
    expect(running.status).toBe('RUNNING')
    expect(observed).toContain('STARTING')
    expect((await bridge.healthCheck()).healthy).toBe(true)
    expect(bridge.events().map((event) => event.kind)).toEqual([
      'RUNTIME_STARTED',
      'AGENT_READY',
    ])

    const stopped = await bridge.stop()
    expect(stopped.status).toBe('NOT_RUNNING')
    expect(bridge.events().at(-1)?.kind).toBe('RUNTIME_STOPPED')
  })

  it('deduplicates concurrent connection attempts and event subscriptions', async () => {
    const { bridge } = harness()

    const [first, second] = await Promise.all([bridge.connect(), bridge.connect()])
    expect(first.connection).toBe('CONNECTED')
    expect(second.connection).toBe('CONNECTED')

    await bridge.start()
    expect(bridge.snapshot().status).toBe('RUNNING')
    expect(bridge.events().map((event) => event.kind)).toEqual([
      'RUNTIME_STARTED',
      'AGENT_READY',
    ])
  })

  it('synchronizes busy, waiting input, and error events', async () => {
    const { bridge, fixture } = harness()
    await bridge.connect()
    await bridge.start()

    fixture.simulateActivity('BUSY')
    expect(bridge.snapshot().status).toBe('BUSY')
    fixture.simulateActivity('WAITING_INPUT')
    expect(bridge.snapshot().status).toBe('WAITING_INPUT')
    fixture.simulateError()

    expect(bridge.snapshot().status).toBe('ERROR')
    expect((await bridge.healthCheck()).healthy).toBe(false)
    expect(bridge.events().map((event) => event.kind)).toContain('RUNTIME_ERROR')
  })

  it('reports a lost connection and reconnects with the same temporary session', async () => {
    const { bridge, fixture } = harness()
    await bridge.connect()
    await bridge.start()

    fixture.simulateConnectionLoss()
    expect(bridge.snapshot().connection).toBe('DISCONNECTED')
    await expect(bridge.status()).rejects.toBeInstanceOf(RuntimeBridgeConnectionError)

    const restored = await bridge.reconnect()
    expect(restored.connection).toBe('CONNECTED')
    expect(restored.status).toBe('RUNNING')
    expect(bridge.auditEvents().map((event) => event.action)).toContain(
      'runtime.connection_restored',
    )
  })

  it('rejects an incorrect temporary credential', async () => {
    const fixture = new ContractDshRuntimeFixture({
      id: () => 'fixed',
      now: () => new Date('2026-08-20T08:00:00.000Z'),
      port: () => 54321,
    })
    const session = fixture.createSession()

    await expect(
      fixture.connect({ ...session, credential: 'fixture-attacker-token' }),
    ).rejects.toBeInstanceOf(RuntimeAuthorizationError)
  })

  it('keeps credentials and endpoint details out of public snapshots and audit', async () => {
    const { bridge, fixture } = harness()
    await bridge.connect()
    const serialized = JSON.stringify({
      snapshot: bridge.snapshot(),
      events: bridge.events(),
      audit: bridge.auditEvents(),
    })

    expect(serialized).not.toContain('credential')
    expect(serialized).not.toContain('127.0.0.1')
    expect(serialized).not.toContain('54321')
    expect('sendRequest' in fixture).toBe(false)
  })

  it('keeps the audit history immutable to callers', async () => {
    const { bridge } = harness()
    await bridge.connect()
    const audit = bridge.auditEvents()

    expect(Object.isFrozen(audit)).toBe(true)
    expect(Object.isFrozen(audit[0])).toBe(true)
  })
})
