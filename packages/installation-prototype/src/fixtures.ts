import type { MockInstallationManifest } from './types.js'

export const safeTestAgentManifest: MockInstallationManifest = Object.freeze({
  schemaVersion: 1,
  manifestId: 'prototype-manifest-safe-test-agent-1-0-0',
  pluginId: 'safe-test-agent',
  pluginName: 'Safe Test Agent',
  pluginVersionId: 'prototype-version-safe-test-agent-1-0-0',
  version: '1.0.0',
  riskLevel: 'LOW',
  riskReason: 'Uses one declared network endpoint in this simulation.',
  permissions: Object.freeze([
    Object.freeze({
      permissionId: 'network-access' as const,
      riskLevel: 'LOW' as const,
      reason: 'Connect to the simulated example service.',
      scope: 'api.example.invalid',
      phase: 'RUNTIME' as const,
    }),
  ]),
  simulationOnly: true,
  executionPolicy: 'SIMULATION_ONLY',
})

export const permissionReviewAgentManifest: MockInstallationManifest = Object.freeze({
  schemaVersion: 1,
  manifestId: 'prototype-manifest-permission-review-agent-1-2-0',
  pluginId: 'permission-review-agent',
  pluginName: 'Permission Review Agent',
  pluginVersionId: 'prototype-version-permission-review-agent-1-2-0',
  version: '1.2.0',
  riskLevel: 'MEDIUM',
  riskReason: 'Declares project file access and simulated install-time code.',
  permissions: Object.freeze([
    Object.freeze({
      permissionId: 'network-access' as const,
      riskLevel: 'LOW' as const,
      reason: 'Connect to the simulated example service.',
      scope: 'api.example.invalid',
      phase: 'RUNTIME' as const,
    }),
    Object.freeze({
      permissionId: 'project-file-read' as const,
      riskLevel: 'MEDIUM' as const,
      reason: 'Read files selected in the simulated project.',
      scope: 'selected project only',
      phase: 'RUNTIME' as const,
    }),
    Object.freeze({
      permissionId: 'install-time-code' as const,
      riskLevel: 'HIGH' as const,
      reason: 'Demonstrate the separate warning for install-time code without executing it.',
      scope: 'simulation only',
      phase: 'INSTALL' as const,
    }),
  ]),
  simulationOnly: true,
  executionPolicy: 'SIMULATION_ONLY',
})
