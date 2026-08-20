export { MockEnvironmentManager, type EnvironmentManager } from './environment-manager.js'
export { permissionReviewAgentManifest, safeTestAgentManifest } from './fixtures.js'
export {
  InstallationAuthorizationError,
  InstallationStateError,
  MockInstallationEngine,
} from './mock-installation-engine.js'
export type {
  InstallationActor,
  InstallationAuditEvent,
  InstallationAuditResult,
  InstallationStatus,
  InstallationStep,
  InstallationStepKind,
  InstallationStepStatus,
  InstallationTransaction,
  MockInstallationManifest,
  PrototypeCapabilityAnalysis,
  PrototypeEnvironmentSnapshot,
  PrototypePermission,
  PrototypePermissionId,
  PrototypeRiskLevel,
  SimulationScenario,
} from './types.js'
