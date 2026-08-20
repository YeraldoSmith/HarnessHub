import type {
  PlatformAdapter,
  PlatformCapabilities,
  RuntimeEnvironmentSnapshot,
  RuntimePlatform,
} from './types.js'

const capabilities: PlatformCapabilities = Object.freeze({
  readOnlyDetection: true,
  setupPlanGeneration: true,
  runtimeExecution: false,
  systemMutation: false,
  dshSetupExecution: false,
})

class ReadonlyPlatformAdapter implements PlatformAdapter {
  constructor(readonly platform: Exclude<RuntimePlatform, 'Unknown'>) {}

  supports(environment: RuntimeEnvironmentSnapshot): boolean {
    return environment.platform === this.platform
  }

  capabilities(): PlatformCapabilities {
    return capabilities
  }
}

export const macOSPlatformAdapter: PlatformAdapter = new ReadonlyPlatformAdapter('macOS')
export const windowsPlatformAdapter: PlatformAdapter = new ReadonlyPlatformAdapter('Windows')
export const linuxPlatformAdapter: PlatformAdapter = new ReadonlyPlatformAdapter('Linux')
export const readonlyPlatformAdapters: readonly PlatformAdapter[] = Object.freeze([
  macOSPlatformAdapter,
  windowsPlatformAdapter,
  linuxPlatformAdapter,
])
