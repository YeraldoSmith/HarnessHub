import { invoke, isTauri } from '@tauri-apps/api/core'

import type { Plugin, PluginRiskLevel } from '@harnesshub/types'

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
  const policy = pluginInstallationPolicy(plugin)
  const npm = plugin.source_evidence.find((evidence) => evidence.provider === 'npm')
  const packageName = npm?.package_name
  const version = npm?.npm_version ?? plugin.npm_version
  const integrity = npm?.integrity
  if (!packageName || !version || !integrity?.startsWith('sha512-')) return null
  return {
    packageName,
    version,
    integrity,
    sourceKind: 'NPM',
    sourceUrl: plugin.github_url,
    sourceCommit: plugin.source_commit,
    riskLevel: policy.riskLevel,
    requiredConfirmations: policy.requiredConfirmations,
  }
}

interface GitHubRepositoryMetadata {
  default_branch: string
}

interface GitHubContentResponse {
  content?: string
  encoding?: string
}

function githubRepositoryPath(repositoryUrl: string): string | null {
  try {
    const url = new URL(repositoryUrl)
    const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || parts.length !== 2) return null
    return `${parts[0]}/${parts[1]}`
  } catch {
    return null
  }
}

async function githubJson<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub source returned status ${response.status}.`)
  return response.json() as Promise<T>
}

function decodeGitHubContent(content: GitHubContentResponse): string {
  if (content.encoding !== 'base64' || !content.content) throw new Error('The repository has no readable package.json.')
  const bytes = Uint8Array.from(atob(content.content.replace(/\s/g, '')), (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export async function resolveInstallableEvidence(plugin: Plugin): Promise<InstallablePluginEvidence> {
  const existing = installableEvidence(plugin)
  if (existing) return existing
  const repositoryUrl = plugin.github_url
  const repository = repositoryUrl ? githubRepositoryPath(repositoryUrl) : null
  if (!repository || !repositoryUrl) throw new Error('This plugin has no installable GitHub repository source.')

  const metadata = await githubJson<GitHubRepositoryMetadata>(`/repos/${repository}`)
  const commit = await githubJson<{ sha: string }>(
    `/repos/${repository}/commits/${encodeURIComponent(metadata.default_branch)}`,
  )
  if (!/^[a-f0-9]{40}$/i.test(commit.sha)) throw new Error('GitHub did not return a fixed source commit.')
  const content = await githubJson<GitHubContentResponse>(
    `/repos/${repository}/contents/package.json?ref=${encodeURIComponent(commit.sha)}`,
  )
  const manifest = JSON.parse(decodeGitHubContent(content)) as { name?: unknown; version?: unknown }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error('The repository package.json has no package name.')
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw new Error('The repository package.json has no fixed package version.')
  }
  const policy = pluginInstallationPolicy(plugin)
  return {
    packageName: manifest.name,
    version: manifest.version,
    integrity: `git-commit:${commit.sha.toLowerCase()}`,
    sourceKind: 'GITHUB',
    sourceUrl: repositoryUrl,
    sourceCommit: commit.sha.toLowerCase(),
    riskLevel: policy.riskLevel,
    requiredConfirmations: policy.requiredConfirmations,
  }
}

export function managedPluginForRegistryEntry(
  plugin: Plugin,
  records: ManagedPluginRecord[],
): ManagedPluginRecord | null {
  const packageName = plugin.source_evidence.find((evidence) => evidence.provider === 'npm')?.package_name
  return records.find((record) => (
    record.packageName === packageName || record.pluginId === plugin.id
  )) ?? null
}

export function nativeAvailable(): boolean {
  return isTauri()
}

export async function getManagedRuntimeStatus(): Promise<ManagedRuntimeStatus> {
  if (!isTauri()) return emptyManagedRuntime
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
  if (!isTauri()) throw new Error('The DSH workspace is available in HarnessHub Desktop only.')
  await invoke('open_managed_runtime_workspace')
}

export async function listInstallationAudit(): Promise<InstallationAuditRecord[]> {
  if (!isTauri()) return []
  return invoke<InstallationAuditRecord[]>('list_installation_audit')
}

export async function saveSessionToken(token: string): Promise<void> {
  if (isTauri()) await invoke('save_session_token', { token })
}

export async function loadSessionToken(): Promise<string | null> {
  if (!isTauri()) return null
  return invoke<string | null>('load_session_token')
}

export async function deleteSessionToken(): Promise<void> {
  if (isTauri()) await invoke('delete_session_token')
}
