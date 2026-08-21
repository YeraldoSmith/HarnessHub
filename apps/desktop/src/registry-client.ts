import { invoke } from '@tauri-apps/api/core'

import {
  candidatePluginResponseSchema,
  discoveryRefreshResponseSchema,
  pluginSchema,
  registryResponseSchema,
} from '@harnesshub/plugin-schema'
import { CommunityCatalogAdapter, type PublicSourceCandidate } from '@harnesshub/plugin-sources/browser'
import type {
  CandidatePlugin,
  CandidatePluginResponse,
  DiscoveryRefreshResponse,
  Plugin,
  RegistryResponse,
} from '@harnesshub/types'

import bundledRegistryJson from './registry-snapshot.json'
import { isHarnessHubDesktop } from './desktop-environment.js'

export type RegistryLoadSource = 'LIVE' | 'BUNDLED'

export interface RegistryLoadResult {
  registry: RegistryResponse
  source: RegistryLoadSource
}

type RegistryFetcher = (path: string, init?: RequestInit) => Promise<Response>

export class DesktopApiUnavailableError extends Error {
  constructor() {
    super('HarnessHub API is unavailable.')
    this.name = 'DesktopApiUnavailableError'
  }
}

const configuredApiUrl = import.meta.env.VITE_HARNESSHUB_API_URL?.trim()

export const desktopApiUrl = configuredApiUrl || 'http://127.0.0.1:3001'
export const bundledRegistry = registryResponseSchema.parse(bundledRegistryJson)
// v2 deliberately invalidates the old GitHub-topic cache, whose items were
// gathered before the fixed-commit community Bundle catalog was introduced.
// v4 drops the cache entries written while one malformed third-party record
// could make the entire candidate-to-plugin conversion fail.
// Bump when the persisted candidate shape changes so stale WebView records cannot
// silently lose install evidence during schema parsing.
const localDiscoveryCacheKey = 'harnesshub.public-discovery.v5'
const localDiscoveryCacheTtlMs = 6 * 60 * 60_000

export async function fetchDesktopApi(
  path: string,
  init?: RequestInit,
  timeoutMilliseconds = 5000,
  apiBaseUrl = desktopApiUrl,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMilliseconds)
  try {
    return await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, { ...init, signal: controller.signal })
  } catch {
    throw new DesktopApiUnavailableError()
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function loadDesktopRegistry(
  fetcher?: RegistryFetcher,
  apiBaseUrl = desktopApiUrl,
): Promise<RegistryLoadResult> {
  const selectedFetcher = fetcher ?? ((path, init) => fetchDesktopApi(path, init, 5000, apiBaseUrl))
  try {
    const response = await selectedFetcher('/plugins?limit=100&sort=name', {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Registry status ${response.status}`)
    return {
      registry: registryResponseSchema.parse(await response.json()),
      source: 'LIVE',
    }
  } catch {
    return { registry: bundledRegistry, source: 'BUNDLED' }
  }
}

export function candidateToPlugin(candidate: CandidatePlugin): Plugin {
  const npmBacked = candidate.package_integrity?.startsWith('sha512-')
  const npmUrl = npmBacked && candidate.package_name
    ? `https://www.npmjs.com/package/${candidate.package_name}`
    : null
  return pluginSchema.parse({
    id: `candidate-${`${candidate.repository}-${candidate.bundle_directory ?? 'root'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    name: candidate.name,
    description: candidate.description || `Public DSH plugin candidate from ${candidate.repository}`,
    source: npmBacked ? 'github+npm' : 'github',
    github_url: candidate.repository_url,
    npm_url: npmUrl,
    author: { name: candidate.owner, handle: candidate.owner },
    version: candidate.package_version ?? '0.0.0-candidate',
    category: candidate.category,
    tags: [
      'discovered',
      'dsh-plugin',
      ...(candidate.dsh_bundle_patch ? ['installable-bundle'] : ['source-only']),
      ...(candidate.bundle_directory ? [`bundle-${candidate.bundle_directory.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`] : []),
    ],
    permissions: candidate.permissions,
    compatibility: {
      dsh: candidate.dsh_compatibility ?? 'unknown',
      status: candidate.dsh_compatibility ? 'declared' : 'unknown',
    },
    license: {
      spdx: candidate.license_spdx ?? 'NOASSERTION',
      name: candidate.license_spdx ?? 'License not verified',
      url: null,
    },
    source_commit: candidate.commit_sha,
    npm_version: candidate.package_version,
    checked_at: candidate.last_observed_at,
    source_evidence: [
      {
        provider: 'github',
        url: candidate.repository_url,
        repository_url: candidate.repository_url,
        package_name: candidate.package_name,
        fetched_at: candidate.last_observed_at,
        commit_sha: candidate.commit_sha,
        release_tag: null,
        npm_version: candidate.package_version,
        integrity: candidate.package_integrity,
        readme_sha256: null,
        license_spdx: candidate.license_spdx,
      },
      ...(npmBacked && candidate.package_name ? [{
        provider: 'npm' as const,
        url: `https://registry.npmjs.org/${encodeURIComponent(candidate.package_name)}`,
        repository_url: candidate.repository_url,
        package_name: candidate.package_name,
        fetched_at: candidate.last_observed_at,
        commit_sha: null,
        release_tag: null,
        npm_version: candidate.package_version,
        integrity: candidate.package_integrity,
        readme_sha256: null,
        license_spdx: candidate.license_spdx,
      }] : []),
    ],
    source_status: [{
      provider: 'github',
      status: 'AVAILABLE',
      last_verified_at: candidate.last_observed_at,
      unavailable_since: null,
      error: candidate.last_error,
    }, ...(npmBacked && candidate.package_name ? [{
      provider: 'npm' as const,
      status: candidate.package_integrity ? 'AVAILABLE' as const : 'UNKNOWN' as const,
      last_verified_at: candidate.package_integrity ? candidate.last_observed_at : null,
      unavailable_since: null,
      error: null,
    }] : [])],
    readme_excerpt: candidate.readme_excerpt,
    registry_status: 'COLLECTED_UNVERIFIED',
    risk_level: candidate.risk_level,
    risk_reasons: candidate.risk_reasons,
    risk_assessed_at: candidate.risk_assessed_at,
    risk_model_version: candidate.risk_model_version,
    discovery_snapshot_sha256: candidate.metadata_sha256,
    stars: candidate.stars,
    upstream_updated_at: candidate.upstream_updated_at,
    is_mock: false,
  })
}

export function isInstallableCandidate(candidate: CandidatePlugin): boolean {
  const gitEvidence = candidate.package_integrity === `git-commit:${candidate.commit_sha}`
  return Boolean(
    candidate.commit_sha
    && candidate.package_name
    && candidate.package_version
    && (candidate.package_integrity?.startsWith('sha512-') || gitEvidence)
    && candidate.dsh_bundle_patch,
  )
}

function installableCandidatePlugins(candidates: CandidatePlugin[]): Plugin[] {
  const plugins: Plugin[] = []
  for (const candidate of candidates) {
    if (!isInstallableCandidate(candidate)) continue
    try {
      plugins.push(candidateToPlugin(candidate))
    } catch {
      // An individual third-party metadata record must not take the whole
      // Marketplace offline. Its raw source evidence remains in the local
      // discovery cache for a later adapter correction.
    }
  }
  return plugins
}

export function publicSourceToCandidate(candidate: PublicSourceCandidate): CandidatePlugin {
  return {
    id: `local-${candidate.metadata_sha256.slice(0, 32)}`,
    provider: 'github',
    external_id: candidate.external_id,
    repository: candidate.repository,
    repository_url: candidate.repository_url,
    bundle_directory: candidate.bundle_directory,
    owner: candidate.author,
    name: candidate.name,
    description: candidate.description,
    default_branch: candidate.default_branch,
    readme_excerpt: candidate.readme_excerpt,
    license_spdx: candidate.license_spdx,
    stars: candidate.stars,
    upstream_updated_at: candidate.upstream_updated_at,
    commit_sha: candidate.commit_sha,
    package_name: candidate.package_name,
    package_version: candidate.version,
    package_integrity: candidate.package_integrity,
    dsh_bundle_patch: candidate.dsh_bundle_patch,
    dsh_compatibility: candidate.dsh_compatibility,
    category: candidate.category,
    permissions: candidate.permissions,
    risk_level: candidate.risk_level,
    risk_reasons: candidate.risk_reasons,
    risk_assessed_at: candidate.risk_assessed_at,
    risk_model_version: candidate.risk_model_version,
    metadata_sha256: candidate.metadata_sha256,
    discovered_at: candidate.discovered_at,
    last_observed_at: candidate.discovered_at,
    status: 'COLLECTED_UNVERIFIED',
    retry_count: candidate.retry_count,
    last_error: candidate.last_error,
  }
}

function readLocalDiscoveryCache(allowExpired = false): CandidatePluginResponse | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(localDiscoveryCacheKey)
  if (!stored) return null
  try {
    const value = JSON.parse(stored) as { cached_at?: unknown; response?: unknown }
    if (typeof value.cached_at !== 'string') return null
    if (!allowExpired && Date.now() - Date.parse(value.cached_at) > localDiscoveryCacheTtlMs) return null
    return candidatePluginResponseSchema.parse(value.response)
  } catch {
    return null
  }
}

function writeLocalDiscoveryCache(response: CandidatePluginResponse): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(localDiscoveryCacheKey, JSON.stringify({
    cached_at: new Date().toISOString(),
    response,
  }))
}

async function refreshLocalDiscovery(): Promise<DiscoveryRefreshResponse> {
  const catalogFetcher: typeof fetch = async () => new Response(
    await invoke<string>('fetch_community_catalog'),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
  // The curated catalog is the authoritative Desktop baseline. Do not make
  // Marketplace availability depend on GitHub's public search API: WebView
  // network policies and rate limits can make that best-effort enrichment slow
  // or unavailable, but they must never reduce the user back to 20 bundled
  // entries. The API service can continue to run broader discovery separately.
  const catalogCandidates = await new CommunityCatalogAdapter({ fetch: catalogFetcher, maxEntries: 200 }).discover()
  const githubCandidates: PublicSourceCandidate[] = []
  const merged = new Map<string, PublicSourceCandidate>()
  for (const candidate of [...catalogCandidates, ...githubCandidates]) {
    merged.set(`${candidate.repository.toLowerCase()}#${candidate.bundle_directory ?? ''}`, candidate)
  }
  const discovered = [...merged.values()]
  if (discovered.length === 0) throw new DesktopApiUnavailableError()
  const response = candidatePluginResponseSchema.parse({
    items: discovered.map(publicSourceToCandidate),
    total: discovered.length,
  })
  writeLocalDiscoveryCache(response)
  const failed = discovered.filter((candidate) => candidate.last_error).length
  return {
    status: failed > 0 ? 'PARTIAL' : 'SUCCESS',
    discovered: discovered.length,
    stored: discovered.length,
    failed,
    next_refresh_at: new Date(Date.now() + localDiscoveryCacheTtlMs).toISOString(),
  }
}

export async function loadDesktopCandidates(
  apiBaseUrl = desktopApiUrl,
): Promise<{ items: Plugin[]; available: boolean }> {
  if (!configuredApiUrl && apiBaseUrl === desktopApiUrl) {
    const cached = readLocalDiscoveryCache()
    if (cached) return { items: installableCandidatePlugins(cached.items), available: true }
    try {
      await refreshLocalDiscovery()
      const refreshed = readLocalDiscoveryCache(true)
      if (refreshed) return { items: installableCandidatePlugins(refreshed.items), available: true }
    } catch {
      const stale = readLocalDiscoveryCache(true)
      if (stale) return { items: installableCandidatePlugins(stale.items), available: true }
    }
    return { items: [], available: false }
  }
  try {
    const response = await fetchDesktopApi('/discovery/candidates?limit=1000', {
      headers: { Accept: 'application/json' },
    }, 8000, apiBaseUrl)
    if (!response.ok) throw new Error(`Discovery status ${response.status}`)
    const parsed = candidatePluginResponseSchema.parse(await response.json())
    return { items: installableCandidatePlugins(parsed.items), available: true }
  } catch {
    const cached = readLocalDiscoveryCache()
    if (cached) return { items: installableCandidatePlugins(cached.items), available: true }
    if (isHarnessHubDesktop()) {
      try {
        await refreshLocalDiscovery()
        const refreshed = readLocalDiscoveryCache(true)
        if (refreshed) return { items: installableCandidatePlugins(refreshed.items), available: true }
      } catch {
        const stale = readLocalDiscoveryCache(true)
        if (stale) return { items: installableCandidatePlugins(stale.items), available: true }
      }
    }
    return { items: [], available: false }
  }
}

export async function refreshDesktopDiscovery(apiBaseUrl = desktopApiUrl): Promise<DiscoveryRefreshResponse> {
  if (!configuredApiUrl && apiBaseUrl === desktopApiUrl) {
    return refreshLocalDiscovery()
  }
  try {
    const response = await fetchDesktopApi('/discovery/refresh', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    }, 30_000, apiBaseUrl)
    if (!response.ok) throw new Error(`Discovery refresh status ${response.status}`)
    return discoveryRefreshResponseSchema.parse(await response.json())
  } catch (error) {
    if (!isHarnessHubDesktop()) throw error
    return refreshLocalDiscovery()
  }
}
