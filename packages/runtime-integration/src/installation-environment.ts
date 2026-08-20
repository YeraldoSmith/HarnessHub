import type {
  EnvironmentManager,
  MockInstallationManifest,
  PrototypeCapabilityAnalysis,
  PrototypeEnvironmentSnapshot,
} from '@harnesshub/installation-prototype'

import type { RuntimeEnvironmentSnapshot } from './types.js'

export class ControlledRuntimeInstallationEnvironment implements EnvironmentManager {
  constructor(private readonly runtime: RuntimeEnvironmentSnapshot) {}

  checkEnvironment(): PrototypeEnvironmentSnapshot {
    return {
      id: `installation-${this.runtime.id}`,
      platform: 'PROTOTYPE',
      supportedPlatforms: ['macOS', 'Windows', 'Linux'],
      runtimeSnapshotId: this.runtime.id,
      detectedPlatform: this.runtime.platform,
      detectedArchitecture: this.runtime.architecture,
      dshDetected: this.runtime.dsh.status === 'AVAILABLE',
      dshVersion: this.runtime.dsh.version,
      dshExecutionAvailable: false,
      systemMutationAllowed: false,
      capturedAt: this.runtime.capturedAt,
    }
  }

  analyzeCapability(
    manifest: MockInstallationManifest,
    _environment: PrototypeEnvironmentSnapshot,
  ): PrototypeCapabilityAnalysis {
    return {
      simulationOnly: true,
      permissions: manifest.permissions,
      riskLevel: manifest.riskLevel,
      blockingReasons: [],
    }
  }
}
