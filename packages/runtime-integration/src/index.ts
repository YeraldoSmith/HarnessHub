export { ControlledDshAdapter, supportedDshRange } from './dsh-adapter.js'
export { normalizeRuntimeSnapshot, parseVersion, RuntimeEnvironmentManager } from './environment-manager.js'
export { ControlledRuntimeInstallationEnvironment } from './installation-environment.js'
export {
  linuxPlatformAdapter,
  macOSPlatformAdapter,
  readonlyPlatformAdapters,
  windowsPlatformAdapter,
} from './platform-adapter.js'
export { evaluateTrustedInstallBoundary } from './trusted-install-policy.js'
export type {
  DshAdapter,
  DshCompatibilityResult,
  DshCompatibilityStatus,
  DshDetection,
  NativeRuntimeEnvironmentSnapshot,
  NativeToolProbe,
  PlatformAdapter,
  PlatformCapabilities,
  ReadonlyEnvironmentProbe,
  RuntimeEnvironmentSnapshot,
  RuntimePlatform,
  RuntimeSetupPermission,
  RuntimeSetupPlan,
  RuntimeSetupStep,
  RuntimeToolState,
  RuntimeToolStatus,
  SetupPermissionId,
  TrustedInstallCandidate,
  TrustedInstallDecision,
} from './types.js'
