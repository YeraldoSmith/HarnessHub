import { invoke, isTauri } from '@tauri-apps/api/core'

import type { Plugin } from '@harnesshub/types'

export interface ManagedPluginRecord {
  pluginId: string
  packageName: string
  version: string
  integrity: string
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

export function installableEvidence(plugin: Plugin): InstallablePluginEvidence | null {
  const npm = plugin.source_evidence.find((evidence) => evidence.provider === 'npm')
  const packageName = npm?.package_name
  const version = npm?.npm_version ?? plugin.npm_version
  const integrity = npm?.integrity
  if (!packageName || !version || !integrity?.startsWith('sha512-')) return null
  if (plugin.source_status.find((source) => source.provider === 'npm')?.status !== 'AVAILABLE') return null
  return { packageName, version, integrity }
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

export async function installManagedPlugin(plugin: Plugin): Promise<ManagedOperationResult> {
  const evidence = installableEvidence(plugin)
  if (!evidence) throw new Error('This plugin does not have complete npm installation evidence.')
  return invoke<ManagedOperationResult>('install_managed_plugin', {
    request: {
      pluginId: plugin.id,
      packageName: evidence.packageName,
      version: evidence.version,
      integrity: evidence.integrity,
      confirmed: true,
    },
  })
}

export async function removeManagedPlugin(plugin: Plugin): Promise<ManagedOperationResult> {
  const evidence = installableEvidence(plugin)
  if (!evidence) throw new Error('This plugin does not have complete npm installation evidence.')
  return invoke<ManagedOperationResult>('remove_managed_plugin', {
    request: {
      pluginId: plugin.id,
      packageName: evidence.packageName,
      confirmed: true,
    },
  })
}

export async function startManagedRuntime(): Promise<ManagedRuntimeStatus> {
  return invoke<ManagedRuntimeStatus>('start_managed_runtime')
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
