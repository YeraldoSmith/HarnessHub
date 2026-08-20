export type PrototypeRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type PrototypePermissionId =
  | 'network-access'
  | 'project-file-read'
  | 'project-file-write'
  | 'shell-execution'
  | 'browser-control'
  | 'environment-access'
  | 'install-time-code'

export interface PrototypePermission {
  permissionId: PrototypePermissionId
  riskLevel: PrototypeRiskLevel
  reason: string
  scope: string
  phase: 'INSTALL' | 'RUNTIME'
}

export interface MockInstallationManifest {
  schemaVersion: 1
  manifestId: string
  pluginId: string
  pluginName: string
  pluginVersionId: string
  version: string
  riskLevel: PrototypeRiskLevel
  riskReason: string
  permissions: readonly PrototypePermission[]
  simulationOnly: true
  executionPolicy: 'SIMULATION_ONLY'
}

export type InstallationStatus =
  | 'REQUESTED'
  | 'ANALYZING'
  | 'WAITING_CONFIRMATION'
  | 'INSTALLING_SIMULATED'
  | 'VERIFYING'
  | 'INSTALLED'
  | 'CANCELLED'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'RECOVERY_REQUIRED'

export type InstallationStepStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

export type InstallationStepKind =
  | 'MANIFEST_RESOLUTION'
  | 'ENVIRONMENT_CHECK'
  | 'PERMISSION_ANALYSIS'
  | 'USER_CONFIRMATION'
  | 'SIMULATED_APPLY'
  | 'SIMULATED_VERIFY'
  | 'SIMULATED_ROLLBACK'

export interface InstallationStep {
  id: string
  kind: InstallationStepKind
  status: InstallationStepStatus
  createdAt: string
  updatedAt: string
}

export interface InstallationTransaction {
  id: string
  actorUserId: string
  pluginId: string
  pluginVersionId: string
  pluginVersion: string
  manifestId: string
  status: InstallationStatus
  steps: readonly InstallationStep[]
  environmentSnapshotId: string | null
  createdAt: string
  updatedAt: string
}

export type InstallationAuditResult = 'INFO' | 'SUCCESS' | 'FAILURE'

export interface InstallationAuditEvent {
  id: string
  transactionId: string
  actorUserId: string
  action: string
  fromStatus: InstallationStatus | null
  toStatus: InstallationStatus
  timestamp: string
  result: InstallationAuditResult
}

export interface InstallationActor {
  userId: string
}

export type SimulationScenario =
  | 'SUCCESS'
  | 'FAIL_ROLLBACK_SUCCESS'
  | 'FAIL_ROLLBACK_FAILURE'

export interface PrototypeEnvironmentSnapshot {
  id: string
  platform: 'PROTOTYPE'
  supportedPlatforms: readonly ['macOS', 'Windows', 'Linux']
  dshExecutionAvailable: false
  systemMutationAllowed: false
  capturedAt: string
}

export interface PrototypeCapabilityAnalysis {
  simulationOnly: true
  permissions: readonly PrototypePermission[]
  riskLevel: PrototypeRiskLevel
  blockingReasons: readonly string[]
}
