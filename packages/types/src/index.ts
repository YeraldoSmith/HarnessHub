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

export type SourceAvailabilityStatus = 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE'

export interface PluginSourceStatus {
  provider: 'github' | 'npm'
  status: SourceAvailabilityStatus
  last_verified_at: string | null
  unavailable_since: string | null
  error: string | null
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
  tags: string[]
  permissions: PluginPermission[]
  compatibility: PluginCompatibility
  license: PluginLicense
  source_commit: string | null
  npm_version: string | null
  checked_at: string
  source_evidence: SourceEvidence[]
  source_status: PluginSourceStatus[]
  readme_excerpt?: string | null
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
  items: Plugin[]
  total: number
  page: number
  hasNext: boolean
}

export interface RegistryListQuery {
  query?: string
  category?: string
  sort?: 'name' | 'recent'
  page: number
  limit: number
}

export interface PluginPageSlice {
  items: Plugin[]
  total: number
}

export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'

export interface SyncJobRecord {
  id: string
  plugin_id: string
  source: string
  status: SyncJobStatus
  started_at: string | null
  finished_at: string | null
  error: string | null
  created_at: string
}

export type AuthUserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'DELETED'
export type AuthRole = 'FOUNDER' | 'ADMIN' | 'MODERATOR' | 'REVIEWER' | 'DEVELOPER' | 'USER'
export type AuthBadge = 'FOUNDER' | 'OFFICIAL' | 'VERIFIED_DEVELOPER' | 'MODERATOR' | 'REVIEWER'

export interface AuthUser {
  id: string
  status: AuthUserStatus
  github: {
    user_id: string
    login: string | null
    avatar_url: string | null
  }
  roles: AuthRole[]
  badges: AuthBadge[]
}

export type AuthSessionResponse =
  | { authenticated: false }
  | {
      authenticated: true
      user: AuthUser
      expires_at: string
    }

export interface DesktopOAuthStartResponse {
  authorization_url: string
  transaction_id: string
  poll_token: string
  expires_at: string
}

export type DesktopSessionExchangeResponse =
  | { status: 'PENDING' }
  | {
      status: 'COMPLETE'
      session_token: string
      session: Extract<AuthSessionResponse, { authenticated: true }>
    }

export type DeveloperVerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'RESTRICTED'
export type DeveloperClaimStatus =
  | 'PENDING'
  | 'VERIFYING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONFLICT'
  | 'EXPIRED'
  | 'CANCELLED'
export type OwnershipType = 'OWNER' | 'MAINTAINER' | 'TEAM_MEMBER' | 'ORGANIZATION_DELEGATE'
export type VerificationMethod = 'GITHUB_REPOSITORY_CHALLENGE'
export type SourceOwnerType = 'USER' | 'ORGANIZATION'

export interface DeveloperProfile {
  id: string
  user_id: string
  display_name: string
  bio: string | null
  website: string | null
  verification_status: DeveloperVerificationStatus
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface DeveloperClaim {
  id: string
  plugin_id: string
  status: DeveloperClaimStatus
  repository_url: string
  source_ref: string
  source_external_id: string
  source_owner_type: SourceOwnerType
  proof_type: VerificationMethod
  challenge_path: string
  challenge_expires_at: string
  verified_at: string | null
  error_code: string | null
  created_at: string
}

export interface PluginOwnership {
  id: string
  plugin_id: string
  user_id: string
  ownership_type: OwnershipType
  verification_method: VerificationMethod
  repository_external_id: string
  source_owner_type: SourceOwnerType
  verified_at: string
  revoked_at: string | null
}

export interface DeveloperTrustSummary {
  profile: DeveloperProfile | null
  claims: DeveloperClaim[]
  ownerships: PluginOwnership[]
}

export interface DeveloperClaimStartResponse {
  claim: DeveloperClaim
  challenge: {
    path: string
    content: string
    expires_at: string
    instructions: string
  }
}

export interface DeveloperClaimVerificationResponse {
  claim: DeveloperClaim
  ownership: PluginOwnership
  badge: 'VERIFIED_DEVELOPER'
}
