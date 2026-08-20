import type { PrototypeRiskLevel } from '@harnesshub/installation-prototype'

export type RuntimePlatform = 'macOS' | 'Windows' | 'Linux' | 'Unknown'
export type RuntimeToolStatus = 'AVAILABLE' | 'MISSING' | 'ERROR'

export interface NativeToolProbe {
  name: string
  status: RuntimeToolStatus
  versionOutput: string | null
  probe: 'FIXED_VERSION_ARGUMENT'
  readOnly: true
}

export interface NativeRuntimeEnvironmentSnapshot {
  id: string
  platform: RuntimePlatform
  architecture: string
  node: NativeToolProbe
  pnpm: NativeToolProbe
  git: NativeToolProbe
  dsh: NativeToolProbe
  managedToolchainReady: boolean
  capturedAtUnixMs: number
  readOnly: true
  systemMutationAllowed: false
}

export interface RuntimeToolState extends NativeToolProbe {
  version: string | null
}

export interface RuntimeEnvironmentSnapshot {
  id: string
  platform: RuntimePlatform
  architecture: string
  node: RuntimeToolState
  pnpm: RuntimeToolState
  git: RuntimeToolState
  dsh: RuntimeToolState
  managedToolchainReady: boolean
  capturedAt: string
  readOnly: true
  systemMutationAllowed: false
}

export interface ReadonlyEnvironmentProbe {
  detect(): Promise<NativeRuntimeEnvironmentSnapshot>
}

export type DshCompatibilityStatus = 'COMPATIBLE' | 'MISSING' | 'INCOMPATIBLE' | 'UNKNOWN'

export interface DshDetection {
  installed: boolean
  version: string | null
  status: RuntimeToolStatus
}

export interface DshCompatibilityResult {
  status: DshCompatibilityStatus
  version: string | null
  supportedRange: string
  reason: string
}

export type SetupPermissionId = 'NETWORK_DOWNLOAD' | 'USER_PROFILE_WRITE' | 'RUNTIME_EXECUTION'

export interface RuntimeSetupPermission {
  id: SetupPermissionId
  required: boolean
  reason: string
}

export interface RuntimeSetupStep {
  id: string
  title: string
  description: string
  executable: false
}

export interface RuntimeSetupPlan {
  id: string
  environmentSnapshotId: string
  dshStatus: DshCompatibilityResult
  steps: readonly RuntimeSetupStep[]
  permissions: readonly RuntimeSetupPermission[]
  confirmationRequired: true
  simulationOnly: true
  executionPolicy: 'PLAN_ONLY'
  createdAt: string
}

export interface DshAdapter {
  detect(environment: RuntimeEnvironmentSnapshot): DshDetection
  getVersion(environment: RuntimeEnvironmentSnapshot): string | null
  checkCompatibility(environment: RuntimeEnvironmentSnapshot): DshCompatibilityResult
  prepareInstallPlan(environment: RuntimeEnvironmentSnapshot): RuntimeSetupPlan
}

export interface PlatformCapabilities {
  readOnlyDetection: true
  setupPlanGeneration: true
  runtimeExecution: false
  systemMutation: false
  dshSetupExecution: false
}

export interface PlatformAdapter {
  readonly platform: Exclude<RuntimePlatform, 'Unknown'>
  supports(environment: RuntimeEnvironmentSnapshot): boolean
  capabilities(): PlatformCapabilities
}

export interface TrustedInstallCandidate {
  officialTestPlugin: boolean
  riskLevel: PrototypeRiskLevel
  completeManifest: boolean
  verifiedDeveloper: boolean
}

export interface TrustedInstallDecision {
  eligibleForFutureControlledInstall: boolean
  blockers: readonly string[]
  automaticInstallAllowed: false
}
