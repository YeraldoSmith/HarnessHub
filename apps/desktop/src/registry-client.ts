import { isTauri } from '@tauri-apps/api/core'

import {
  candidatePluginResponseSchema,
  discoveryRefreshResponseSchema,
  pluginSchema,
  registryResponseSchema,
} from '@harnesshub/plugin-schema'
import { GitHubDiscoveryAdapter, type PublicSourceCandidate } from '@harnesshub/plugin-sources/browser'
import type {
  CandidatePlugin,
  CandidatePluginResponse,
  DiscoveryRefreshResponse,
  Plugin,
  RegistryResponse,
} from '@harnesshub/types'

import bundledRegistryJson from './registry-snapshot.json'

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
const localDiscoveryCacheKey = 'harnesshub.public-discovery.v1'
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
  const npmUrl = candidate.package_name
    ? `https://www.npmjs.com/package/${candidate.package_name}`
    : null
  return pluginSchema.parse({
    id: `candidate-${candidate.repository.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    name: candidate.name,
    description: candidate.description || `Public DSH plugin candidate from ${candidate.repository}`,
    source: candidate.package_name ? 'github+npm' : 'github',
    github_url: candidate.repository_url,
    npm_url: npmUrl,
    author: { name: candidate.owner, handle: candidate.owner },
    version: candidate.package_version ?? '0.0.0-candidate',
    category: candidate.category,
    tags: ['discovered', 'dsh-plugin'],
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
        package_name: null,
        fetched_at: candidate.last_observed_at,
        commit_sha: candidate.commit_sha,
        release_tag: null,
        npm_version: null,
        integrity: null,
        readme_sha256: null,
        license_spdx: candidate.license_spdx,
      },
      ...(candidate.package_name ? [{
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
    }, ...(candidate.package_name ? [{
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

export function publicSourceToCandidate(candidate: PublicSourceCandidate): CandidatePlugin {
  return {
    id: `local-${candidate.metadata_sha256.slice(0, 32)}`,
    provider: 'github',
    external_id: candidate.external_id,
    repository: candidate.repository,
    repository_url: candidate.repository_url,
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
  if (!isTauri()) throw new DesktopApiUnavailableError()
  const adapter = new GitHubDiscoveryAdapter({
    perQuery: 50,
    detailLimit: 12,
    retries: 2,
    concurrency: 2,
    pagesPerQuery: 1,
  })
  const discovered = await adapter.discover()
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
  if (isTauri() && !configuredApiUrl && apiBaseUrl === desktopApiUrl) {
    const cached = readLocalDiscoveryCache()
    if (cached) return { items: cached.items.map(candidateToPlugin), available: true }
    try {
      await refreshLocalDiscovery()
      const refreshed = readLocalDiscoveryCache(true)
      if (refreshed) return { items: refreshed.items.map(candidateToPlugin), available: true }
    } catch {
      const stale = readLocalDiscoveryCache(true)
      if (stale) return { items: stale.items.map(candidateToPlugin), available: true }
    }
    return { items: [], available: false }
  }
  try {
    const response = await fetchDesktopApi('/discovery/candidates?limit=200', {
      headers: { Accept: 'application/json' },
    }, 8000, apiBaseUrl)
    if (!response.ok) throw new Error(`Discovery status ${response.status}`)
    const parsed = candidatePluginResponseSchema.parse(await response.json())
    return { items: parsed.items.map(candidateToPlugin), available: true }
  } catch {
    const cached = readLocalDiscoveryCache()
    if (cached) return { items: cached.items.map(candidateToPlugin), available: true }
    if (isTauri()) {
      try {
        await refreshLocalDiscovery()
        const refreshed = readLocalDiscoveryCache(true)
        if (refreshed) return { items: refreshed.items.map(candidateToPlugin), available: true }
      } catch {
        const stale = readLocalDiscoveryCache(true)
        if (stale) return { items: stale.items.map(candidateToPlugin), available: true }
      }
    }
    return { items: [], available: false }
  }
}

export async function refreshDesktopDiscovery(apiBaseUrl = desktopApiUrl): Promise<DiscoveryRefreshResponse> {
  if (isTauri() && !configuredApiUrl && apiBaseUrl === desktopApiUrl) {
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
    if (!isTauri()) throw error
    return refreshLocalDiscovery()
  }
}
