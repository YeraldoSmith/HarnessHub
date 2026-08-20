export type PluginSource = 'mock' | 'github' | 'npm' | 'github+npm'

export type PermissionRisk = 'low' | 'medium' | 'high'

export type PluginPermissionId =
  | 'filesystem-read'
  | 'filesystem-write'
  | 'network'
  | 'subprocess'
  | 'credentials'
  | 'browser'
  | 'install-script'
  | 'telemetry'

export interface PluginPermission {
  id: PluginPermissionId
  label: string
  description: string
  risk: PermissionRisk
}

export interface PluginAuthor {
  name: string
  handle: string
}

export interface PluginCompatibility {
  dsh: string
  status: 'mock' | 'declared' | 'tested' | 'unknown'
}

export interface PluginLicense {
  spdx: string
  name: string
  url: string | null
}

export interface SourceEvidence {
  provider: 'github' | 'npm'
  url: string
  repository_url: string | null
  package_name: string | null
  fetched_at: string
  commit_sha: string | null
  release_tag: string | null
  npm_version: string | null
  integrity: string | null
  readme_sha256: string | null
  license_spdx: string | null
}

export interface Plugin {
  id: string
  name: string
  description: string
  source: PluginSource
  github_url: string | null
  npm_url: string | null
  author: PluginAuthor
  version: string
  category: string
  permissions: PluginPermission[]
  compatibility: PluginCompatibility
  license: PluginLicense
  source_commit: string | null
  npm_version: string | null
  checked_at: string
  source_evidence: SourceEvidence[]
  is_mock: boolean
}

export interface PluginSnapshot {
  plugin: Plugin
  checked_at: string
}

export interface PluginSnapshotRecord extends PluginSnapshot {
  id: string
  plugin_id: string
  plugin_version_id: string
}

export interface PluginSnapshotChange {
  field: 'version' | 'source_commit' | 'npm_version' | 'compatibility' | 'license' | 'source'
  before: string | null
  after: string | null
}

export interface PluginSnapshotComparison {
  plugin_id: string
  from_snapshot_id: string
  to_snapshot_id: string
  changes: PluginSnapshotChange[]
}

export interface RegistryResponse {
  data: Plugin[]
  total: number
}
