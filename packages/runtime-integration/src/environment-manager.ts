import type {
  NativeRuntimeEnvironmentSnapshot,
  ReadonlyEnvironmentProbe,
  RuntimeEnvironmentSnapshot,
  RuntimeToolState,
} from './types.js'

export function parseVersion(output: string | null): string | null {
  if (!output) return null
  return output.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1] ?? null
}

function normalizeTool(tool: NativeRuntimeEnvironmentSnapshot['node']): RuntimeToolState {
  return { ...tool, version: parseVersion(tool.versionOutput) }
}

export function normalizeRuntimeSnapshot(
  snapshot: NativeRuntimeEnvironmentSnapshot,
): RuntimeEnvironmentSnapshot {
  if (!snapshot.readOnly || snapshot.systemMutationAllowed) {
    throw new Error('Runtime detection must be read-only and must not allow system mutation.')
  }
  return Object.freeze({
    id: snapshot.id,
    platform: snapshot.platform,
    architecture: snapshot.architecture,
    node: Object.freeze(normalizeTool(snapshot.node)),
    pnpm: Object.freeze(normalizeTool(snapshot.pnpm)),
    git: Object.freeze(normalizeTool(snapshot.git)),
    dsh: Object.freeze(normalizeTool(snapshot.dsh)),
    managedToolchainReady: snapshot.managedToolchainReady,
    capturedAt: new Date(snapshot.capturedAtUnixMs).toISOString(),
    readOnly: true as const,
    systemMutationAllowed: false as const,
  })
}

export class RuntimeEnvironmentManager {
  constructor(private readonly probe: ReadonlyEnvironmentProbe) {}

  async detect(): Promise<RuntimeEnvironmentSnapshot> {
    return normalizeRuntimeSnapshot(await this.probe.detect())
  }
}
