import type {
  MockInstallationManifest,
  PrototypeCapabilityAnalysis,
  PrototypeEnvironmentSnapshot,
} from './types.js'

export interface EnvironmentManager {
  checkEnvironment(): PrototypeEnvironmentSnapshot
  analyzeCapability(
    manifest: MockInstallationManifest,
    environment: PrototypeEnvironmentSnapshot,
  ): PrototypeCapabilityAnalysis
}

export class MockEnvironmentManager implements EnvironmentManager {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = () => `environment-${globalThis.crypto.randomUUID()}`,
  ) {}

  checkEnvironment(): PrototypeEnvironmentSnapshot {
    return {
      id: this.id(),
      platform: 'PROTOTYPE',
      supportedPlatforms: ['macOS', 'Windows', 'Linux'],
      dshExecutionAvailable: false,
      systemMutationAllowed: false,
      capturedAt: this.now().toISOString(),
    }
  }

  analyzeCapability(
    manifest: MockInstallationManifest,
    environment: PrototypeEnvironmentSnapshot,
  ): PrototypeCapabilityAnalysis {
    if (environment.dshExecutionAvailable || environment.systemMutationAllowed) {
      throw new Error('Prototype environment must never allow real execution or mutation.')
    }
    return {
      simulationOnly: true,
      permissions: manifest.permissions,
      riskLevel: manifest.riskLevel,
      blockingReasons: [],
    }
  }
}
