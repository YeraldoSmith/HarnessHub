import { invoke } from '@tauri-apps/api/core'

import type { Plugin, PluginRiskLevel } from '@harnesshub/types'

import { isHarnessHubDesktop } from './desktop-environment.js'

export interface ManagedPluginRecord {
  pluginId: string
  packageName: string
  version: string
  integrity: string
  sourceKind?: 'NPM' | 'GITHUB'
  enabled?: boolean
  issue?: string | null
  installedAtUnixMs: number
}

export interface ManagedRuntimeStatus {
  prepared: boolean
  dshVersion: string
  profile: string
  running: boolean
  port: number | null
  url: string | null
  pid: number | null
  plugins: ManagedPluginRecord[]
}

export interface ManagedOperationResult {
  success: boolean
  action: string
  message: string
  runtime: ManagedRuntimeStatus
}

export interface InstallationAuditRecord {
  id: string
  action: string
  pluginId: string | null
  packageName: string | null
  version: string | null
  result: string
  message: string
  timestampUnixMs: number
}

export interface InstallablePluginEvidence {
  packageName: string
  version: string
  integrity: string
  sourceKind: 'NPM' | 'GITHUB'
  sourceUrl: string | null
  sourceCommit: string | null
  riskLevel: PluginRiskLevel
  requiredConfirmations: 1 | 2
}

export interface PluginInstallationPolicy {
  riskLevel: PluginRiskLevel
  requiredConfirmations: 1 | 2
  blocked: boolean
}

export const emptyManagedRuntime: ManagedRuntimeStatus = {
  prepared: false,
  dshVersion: '0.1.0-rc.8',
  profile: 'web',
  running: false,
  port: null,
  url: null,
  pid: null,
  plugins: [],
}

export function pluginInstallationPolicy(plugin: Plugin): PluginInstallationPolicy {
  const riskLevel = plugin.risk_level
    ?? (plugin.registry_status === 'COLLECTED_UNVERIFIED' ? 'HIGH' : 'LOW')
  return {
    riskLevel,
    requiredConfirmations: plugin.registry_status === 'COLLECTED_UNVERIFIED'
      || riskLevel === 'HIGH'
      || riskLevel === 'CRITICAL'
      ? 2
      : 1,
    blocked: false,
  }
}

export function installableEvidence(plugin: Plugin): InstallablePluginEvidence | null {
  // Public discovery is intentionally broad. Do not turn a repository that
  // merely mentions DSH into an install action: the discovery snapshot must
  // have observed a real `dsh.bundle.patch` in the package manifest first.
  if (plugin.registry_status === 'COLLECTED_UNVERIFIED' && !plugin.tags.includes('installable-bundle')) return null
  const policy = pluginInstallationPolicy(plugin)
  const npm = plugin.source_evidence.find((evidence) => evidence.provider === 'npm')
  const github = plugin.source_evidence.find((evidence) => evidence.provider === 'github')
  const packageName = npm?.package_name ?? github?.package_name
  const version = npm?.npm_version ?? github?.npm_version ?? plugin.npm_version
  const integrity = npm?.integrity ?? github?.integrity
  const gitPinned = Boolean(
    plugin.source_commit
    && integrity === `git-commit:${plugin.source_commit}`
    && plugin.github_url,
  )
  if (!packageName || !version || !integrity || (!integrity.startsWith('sha512-') && !gitPinned)) return null
  return {
    packageName,
    version,
    integrity,
    sourceKind: gitPinned ? 'GITHUB' : 'NPM',
    sourceUrl: plugin.github_url,
    sourceCommit: plugin.source_commit ?? null,
    riskLevel: policy.riskLevel,
    requiredConfirmations: policy.requiredConfirmations,
  }
}

export async function resolveInstallableEvidence(plugin: Plugin): Promise<InstallablePluginEvidence> {
  const existing = installableEvidence(plugin)
  if (existing) return existing
  throw new Error('此来源尚未保存可安装的固定 DSH bundle 证据。请等待来源同步后再试。')
}

export function managedPluginForRegistryEntry(
  plugin: Plugin,
  records: ManagedPluginRecord[],
): ManagedPluginRecord | null {
  const packageName = plugin.source_evidence.find((evidence) => evidence.provider === 'npm')?.package_name
    ?? plugin.source_evidence.find((evidence) => evidence.provider === 'github')?.package_name
  return records.find((record) => (
    record.packageName === packageName || record.pluginId === plugin.id
  )) ?? null
}

export function nativeAvailable(): boolean {
  return isHarnessHubDesktop()
}

export async function getManagedRuntimeStatus(): Promise<ManagedRuntimeStatus> {
  if (!isHarnessHubDesktop()) return emptyManagedRuntime
  return invoke<ManagedRuntimeStatus>('get_managed_runtime_status')
}

export async function prepareManagedRuntime(): Promise<ManagedOperationResult> {
  return invoke<ManagedOperationResult>('prepare_managed_runtime', { confirmed: true })
}

export async function installManagedPlugin(plugin: Plugin, confirmationCount = 1): Promise<ManagedOperationResult> {
  const evidence = await resolveInstallableEvidence(plugin)
  return invoke<ManagedOperationResult>('install_managed_plugin', {
    request: {
      pluginId: plugin.id,
      packageName: evidence.packageName,
      version: evidence.version,
      integrity: evidence.integrity,
      sourceKind: evidence.sourceKind,
      registryStatus: plugin.registry_status ?? 'PUBLISHED',
      riskLevel: evidence.riskLevel,
      confirmationCount,
      sourceUrl: evidence.sourceUrl,
      sourceCommit: evidence.sourceCommit,
      snapshotSha256: plugin.discovery_snapshot_sha256 ?? null,
      dshCompatibility: plugin.compatibility.dsh,
      confirmed: true,
    },
  })
}

export async function removeManagedPlugin(plugin: Plugin, packageName: string): Promise<ManagedOperationResult> {
  return invoke<ManagedOperationResult>('remove_managed_plugin', {
    request: {
      pluginId: plugin.id,
      packageName,
      confirmed: true,
    },
  })
}

export async function removeManagedPluginRecord(record: ManagedPluginRecord): Promise<ManagedOperationResult> {
  return invoke<ManagedOperationResult>('remove_managed_plugin', {
    request: {
      pluginId: record.pluginId,
      packageName: record.packageName,
      confirmed: true,
    },
  })
}

export async function startManagedRuntime(): Promise<ManagedRuntimeStatus> {
  return invoke<ManagedRuntimeStatus>('start_managed_runtime')
}

/**
 * Recover the managed Runtime after a Desktop restart, an interrupted local
 * connection, or a stopped process. This always remains a local Tauri command;
 * it never forwards arbitrary commands to DSH.
 */
export async function reconnectManagedRuntime(): Promise<ManagedRuntimeStatus> {
  return invoke<ManagedRuntimeStatus>('reconnect_managed_runtime')
}

export async function stopManagedRuntime(): Promise<ManagedRuntimeStatus> {
  return invoke<ManagedRuntimeStatus>('stop_managed_runtime')
}

export async function openManagedRuntimeWorkspace(): Promise<void> {
  if (!isHarnessHubDesktop()) throw new Error('The DSH workspace is available in HarnessHub Desktop only.')
  await invoke('open_managed_runtime_workspace')
}

export async function listInstallationAudit(): Promise<InstallationAuditRecord[]> {
  if (!isHarnessHubDesktop()) return []
  return invoke<InstallationAuditRecord[]>('list_installation_audit')
}

export async function saveSessionToken(token: string): Promise<void> {
  if (isHarnessHubDesktop()) await invoke('save_session_token', { token })
}

export async function loadSessionToken(): Promise<string | null> {
  if (!isHarnessHubDesktop()) return null
  return invoke<string | null>('load_session_token')
}

export async function deleteSessionToken(): Promise<void> {
  if (isHarnessHubDesktop()) await invoke('delete_session_token')
}
