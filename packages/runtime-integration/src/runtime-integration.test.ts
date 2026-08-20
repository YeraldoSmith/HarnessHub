import { describe, expect, it } from 'vitest'

import { permissionReviewAgentManifest } from '@harnesshub/installation-prototype'

import { ControlledDshAdapter } from './dsh-adapter.js'
import { normalizeRuntimeSnapshot, parseVersion, RuntimeEnvironmentManager } from './environment-manager.js'
import { ControlledRuntimeInstallationEnvironment } from './installation-environment.js'
import { macOSPlatformAdapter, windowsPlatformAdapter } from './platform-adapter.js'
import { evaluateTrustedInstallBoundary } from './trusted-install-policy.js'
import type {
  NativeRuntimeEnvironmentSnapshot,
  RuntimeEnvironmentSnapshot,
  RuntimeToolStatus,
} from './types.js'

function nativeSnapshot(
  dshStatus: RuntimeToolStatus,
  dshVersion: string | null,
): NativeRuntimeEnvironmentSnapshot {
  const tool = (name: string, status: RuntimeToolStatus, versionOutput: string | null) => ({
    name,
    status,
    versionOutput,
    probe: 'FIXED_VERSION_ARGUMENT' as const,
    readOnly: true as const,
  })
  return {
    id: 'runtime-test',
    platform: 'macOS',
    architecture: 'aarch64',
    node: tool('Node.js', 'AVAILABLE', 'v22.19.0'),
    pnpm: tool('pnpm', 'AVAILABLE', '11.19.0'),
    git: tool('Git', 'AVAILABLE', 'git version 2.51.0'),
    dsh: tool('DSH', dshStatus, dshVersion),
    managedToolchainReady: false,
    capturedAtUnixMs: Date.parse('2026-08-20T00:00:00.000Z'),
    readOnly: true,
    systemMutationAllowed: false,
  }
}

function runtime(dshStatus: RuntimeToolStatus, dshVersion: string | null): RuntimeEnvironmentSnapshot {
  return normalizeRuntimeSnapshot(nativeSnapshot(dshStatus, dshVersion))
}

describe('controlled runtime integration', () => {
  it('normalizes a read-only macOS environment snapshot', async () => {
    const manager = new RuntimeEnvironmentManager({ detect: async () => nativeSnapshot('MISSING', null) })
    const result = await manager.detect()

    expect(result.platform).toBe('macOS')
    expect(result.architecture).toBe('aarch64')
    expect(result.node.version).toBe('22.19.0')
    expect(result.pnpm.version).toBe('11.19.0')
    expect(result.managedToolchainReady).toBe(false)
    expect(result.git.version).toBe('2.51.0')
    expect(result.readOnly).toBe(true)
    expect(result.systemMutationAllowed).toBe(false)
  })

  it('reports DSH missing', () => {
    const result = new ControlledDshAdapter().checkCompatibility(runtime('MISSING', null))
    expect(result.status).toBe('MISSING')
    expect(result.version).toBeNull()
  })

  it('reports a supported installed DSH version', () => {
    const adapter = new ControlledDshAdapter()
    const environment = runtime('AVAILABLE', 'dsh 0.1.0-rc.8')

    expect(adapter.detect(environment)).toEqual({ installed: true, version: '0.1.0-rc.8', status: 'AVAILABLE' })
    expect(adapter.getVersion(environment)).toBe('0.1.0-rc.8')
    expect(adapter.checkCompatibility(environment).status).toBe('COMPATIBLE')
  })

  it('blocks an incompatible DSH version', () => {
    expect(new ControlledDshAdapter().checkCompatibility(runtime('AVAILABLE', 'dsh 0.2.0')).status).toBe(
      'INCOMPATIBLE',
    )
  })

  it('creates a confirmation-only setup plan with no executable step', () => {
    const plan = new ControlledDshAdapter(
      () => new Date('2026-08-20T00:00:00.000Z'),
      () => 'setup-test',
    ).prepareInstallPlan(runtime('MISSING', null))

    expect(plan.confirmationRequired).toBe(true)
    expect(plan.simulationOnly).toBe(true)
    expect(plan.executionPolicy).toBe('PLAN_ONLY')
    expect(plan.steps.every((step) => step.executable === false)).toBe(true)
    expect(plan.permissions.map((permission) => permission.id)).toEqual([
      'NETWORK_DOWNLOAD',
      'USER_PROFILE_WRITE',
      'RUNTIME_EXECUTION',
    ])
  })

  it('connects the real read-only snapshot to a simulation-only installation environment', () => {
    const environment = new ControlledRuntimeInstallationEnvironment(
      runtime('AVAILABLE', 'dsh 0.1.0-rc.8'),
    )
    const snapshot = environment.checkEnvironment()
    const analysis = environment.analyzeCapability(permissionReviewAgentManifest, snapshot)

    expect(snapshot.detectedPlatform).toBe('macOS')
    expect(snapshot.dshDetected).toBe(true)
    expect(snapshot.dshVersion).toBe('0.1.0-rc.8')
    expect(snapshot.dshExecutionAvailable).toBe(false)
    expect(snapshot.systemMutationAllowed).toBe(false)
    expect(analysis.simulationOnly).toBe(true)
  })

  it('keeps every platform adapter read-only and non-executing', () => {
    expect(macOSPlatformAdapter.supports(runtime('MISSING', null))).toBe(true)
    expect(windowsPlatformAdapter.supports(runtime('MISSING', null))).toBe(false)
    expect(macOSPlatformAdapter.capabilities()).toEqual({
      readOnlyDetection: true,
      setupPlanGeneration: true,
      runtimeExecution: false,
      systemMutation: false,
      dshSetupExecution: false,
    })
  })

  it('allows only a low-risk official verified future candidate and never automatic install', () => {
    const eligible = evaluateTrustedInstallBoundary({
      officialTestPlugin: true,
      riskLevel: 'LOW',
      completeManifest: true,
      verifiedDeveloper: true,
    })
    const highRisk = evaluateTrustedInstallBoundary({
      officialTestPlugin: true,
      riskLevel: 'HIGH',
      completeManifest: true,
      verifiedDeveloper: true,
    })

    expect(eligible.eligibleForFutureControlledInstall).toBe(true)
    expect(eligible.automaticInstallAllowed).toBe(false)
    expect(highRisk.eligibleForFutureControlledInstall).toBe(false)
    expect(highRisk.blockers).toContain('LOW_RISK_REQUIRED')
  })

  it('rejects a detector that claims mutation capability', () => {
    const unsafe = { ...nativeSnapshot('MISSING', null), systemMutationAllowed: true }
    expect(() => normalizeRuntimeSnapshot(unsafe as never)).toThrow(/must be read-only/)
  })

  it('parses runtime version output without trusting surrounding text', () => {
    expect(parseVersion('git version 2.51.0 (Apple Git-155)')).toBe('2.51.0')
    expect(parseVersion('unexpected output')).toBeNull()
  })
})
