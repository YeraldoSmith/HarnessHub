import { describe, expect, it } from 'vitest'

import { MockEnvironmentManager } from './environment-manager.js'
import { permissionReviewAgentManifest, safeTestAgentManifest } from './fixtures.js'
import {
  InstallationAuthorizationError,
  MockInstallationEngine,
} from './mock-installation-engine.js'

function harness() {
  let tick = 0
  let sequence = 0
  const now = () => new Date(Date.UTC(2026, 7, 20, 8, 0, tick++))
  const id = () => String(++sequence).padStart(4, '0')
  const environment = new MockEnvironmentManager(now, () => `environment-${id()}`)
  const engine = new MockInstallationEngine(permissionReviewAgentManifest, environment, { now, id })
  const actor = { userId: 'user-verified-prototype' }
  return { actor, engine }
}

describe('MockInstallationEngine', () => {
  it('completes the simulated happy path without exposing execution capability', () => {
    const { actor, engine } = harness()
    const requested = engine.request(actor)
    const analyzed = engine.analyze(actor, requested.id)
    const installed = engine.run(actor, requested.id, 'SUCCESS')

    expect(analyzed.status).toBe('WAITING_CONFIRMATION')
    expect(installed.status).toBe('INSTALLED')
    expect(installed.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'SIMULATED_APPLY', status: 'SUCCEEDED' }),
        expect.objectContaining({ kind: 'SIMULATED_VERIFY', status: 'SUCCEEDED' }),
        expect.objectContaining({ kind: 'SIMULATED_ROLLBACK', status: 'SKIPPED' }),
      ]),
    )
    expect(engine.getAudit(actor, requested.id).map((event) => event.toStatus)).toEqual([
      'REQUESTED',
      'ANALYZING',
      'WAITING_CONFIRMATION',
      'INSTALLING_SIMULATED',
      'VERIFYING',
      'INSTALLED',
    ])
  })

  it('allows cancellation only while waiting for confirmation', () => {
    const { actor, engine } = harness()
    const requested = engine.request(actor)
    engine.analyze(actor, requested.id)

    expect(engine.cancel(actor, requested.id).status).toBe('CANCELLED')
    expect(() => engine.run(actor, requested.id, 'SUCCESS')).toThrow(/expected WAITING_CONFIRMATION/i)
  })

  it('records a simulated failure and successful rollback', () => {
    const { actor, engine } = harness()
    const requested = engine.request(actor)
    engine.analyze(actor, requested.id)

    const result = engine.run(actor, requested.id, 'FAIL_ROLLBACK_SUCCESS')
    expect(result.status).toBe('ROLLED_BACK')
    expect(engine.getAudit(actor, requested.id).map((event) => event.toStatus)).toEqual(
      expect.arrayContaining(['FAILED', 'ROLLING_BACK', 'ROLLED_BACK']),
    )
  })

  it('reports RECOVERY_REQUIRED instead of pretending a rollback succeeded', () => {
    const { actor, engine } = harness()
    const requested = engine.request(actor)
    engine.analyze(actor, requested.id)

    const result = engine.run(actor, requested.id, 'FAIL_ROLLBACK_FAILURE')
    expect(result.status).toBe('RECOVERY_REQUIRED')
    expect(result.steps).toContainEqual(
      expect.objectContaining({ kind: 'SIMULATED_ROLLBACK', status: 'FAILED' }),
    )
  })

  it('rejects unauthenticated and cross-user transaction access', () => {
    const { actor, engine } = harness()
    expect(() => engine.request(null)).toThrow(InstallationAuthorizationError)
    const requested = engine.request(actor)
    expect(() => engine.analyze({ userId: 'different-user' }, requested.id)).toThrow(
      InstallationAuthorizationError,
    )
    expect(() => engine.getAudit(null, requested.id)).toThrow(InstallationAuthorizationError)
  })

  it('returns frozen append-only audit snapshots', () => {
    const { actor, engine } = harness()
    const requested = engine.request(actor)
    const before = engine.getAudit(actor, requested.id)
    engine.analyze(actor, requested.id)
    const after = engine.getAudit(actor, requested.id)

    expect(Object.isFrozen(before)).toBe(true)
    expect(Object.isFrozen(before[0])).toBe(true)
    expect(before).toHaveLength(1)
    expect(after.length).toBeGreaterThan(before.length)
  })

  it('provides a safe LOW-risk fixture and a permission-review fixture', () => {
    expect(safeTestAgentManifest).toMatchObject({
      pluginName: 'Safe Test Agent',
      version: '1.0.0',
      riskLevel: 'LOW',
      simulationOnly: true,
      executionPolicy: 'SIMULATION_ONLY',
    })
    expect(safeTestAgentManifest.permissions.map((permission) => permission.permissionId)).toEqual([
      'network-access',
    ])
    expect(permissionReviewAgentManifest.permissions.map((permission) => permission.permissionId)).toEqual(
      expect.arrayContaining(['network-access', 'project-file-read', 'install-time-code']),
    )
  })
})
