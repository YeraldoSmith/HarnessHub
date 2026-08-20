import type {
  DshAdapter,
  DshCompatibilityResult,
  DshDetection,
  RuntimeEnvironmentSnapshot,
  RuntimeSetupPlan,
} from './types.js'

const supportedRange = '>=0.1.0-rc.6 <0.2.0'

interface ParsedSemver {
  major: number
  minor: number
  patch: number
  prerelease: readonly (string | number)[]
}

function parseSemver(version: string): ParsedSemver | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : [],
  }
}

function compareIdentifiers(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'number') return -1
  if (typeof right === 'number') return 1
  return left.localeCompare(right)
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] - right[key]
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1
  if (right.prerelease.length === 0 && left.prerelease.length > 0) return -1
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const compared = compareIdentifiers(leftPart, rightPart)
    if (compared !== 0) return compared
  }
  return 0
}

function isSupported(version: string): boolean {
  const value = parseSemver(version)
  const minimum = parseSemver('0.1.0-rc.6')
  const maximum = parseSemver('0.2.0')
  return Boolean(value && minimum && maximum && compareSemver(value, minimum) >= 0 && compareSemver(value, maximum) < 0)
}

export class ControlledDshAdapter implements DshAdapter {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = () => `setup-plan-${globalThis.crypto.randomUUID()}`,
  ) {}

  detect(environment: RuntimeEnvironmentSnapshot): DshDetection {
    return {
      installed: environment.dsh.status === 'AVAILABLE',
      version: environment.dsh.version,
      status: environment.dsh.status,
    }
  }

  getVersion(environment: RuntimeEnvironmentSnapshot): string | null {
    return environment.dsh.version
  }

  checkCompatibility(environment: RuntimeEnvironmentSnapshot): DshCompatibilityResult {
    const detected = this.detect(environment)
    if (detected.status === 'MISSING') {
      return { status: 'MISSING', version: null, supportedRange, reason: 'DSH is not detected.' }
    }
    if (detected.status === 'ERROR' || !detected.version) {
      return { status: 'UNKNOWN', version: detected.version, supportedRange, reason: 'DSH version could not be verified.' }
    }
    return isSupported(detected.version)
      ? { status: 'COMPATIBLE', version: detected.version, supportedRange, reason: 'DSH version is inside the tested range.' }
      : { status: 'INCOMPATIBLE', version: detected.version, supportedRange, reason: 'DSH version is outside the tested range.' }
  }

  prepareInstallPlan(environment: RuntimeEnvironmentSnapshot): RuntimeSetupPlan {
    const dshStatus = this.checkCompatibility(environment)
    return Object.freeze({
      id: this.id(),
      environmentSnapshotId: environment.id,
      dshStatus,
      steps: Object.freeze([
        Object.freeze({ id: 'prepare-dsh', title: 'Prepare DSH', description: 'Plan how an approved DSH release would be prepared.', executable: false as const }),
        Object.freeze({ id: 'create-profile', title: 'Create HarnessHub Profile', description: 'Plan an isolated HarnessHub-managed Profile.', executable: false as const }),
        Object.freeze({ id: 'verify-environment', title: 'Verify environment', description: 'Plan a post-setup compatibility check.', executable: false as const }),
      ]),
      permissions: Object.freeze([
        Object.freeze({ id: 'NETWORK_DOWNLOAD' as const, required: true, reason: 'A future setup would download an approved DSH release.' }),
        Object.freeze({ id: 'USER_PROFILE_WRITE' as const, required: true, reason: 'A future setup would create an isolated user Profile.' }),
        Object.freeze({ id: 'RUNTIME_EXECUTION' as const, required: true, reason: 'A future setup would run only an allowlisted DSH verifier.' }),
      ]),
      confirmationRequired: true as const,
      simulationOnly: true as const,
      executionPolicy: 'PLAN_ONLY' as const,
      createdAt: this.now().toISOString(),
    })
  }
}

export { supportedRange as supportedDshRange }
