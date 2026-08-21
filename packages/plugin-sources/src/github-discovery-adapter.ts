import { fetchJson, SourceFetchError } from './http.js'
import { CANDIDATE_RISK_MODEL_VERSION, classifyCandidate } from './candidate-risk.js'
import type {
  PublicSourceCandidate,
  SourceAdapterOptions,
  SourceAggregationAdapter,
} from './types.js'

interface GitHubSearchRepository {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  default_branch: string
  owner: { login: string }
  license: { spdx_id: string } | null
  stargazers_count: number
  updated_at: string
  topics?: string[]
}

interface GitHubSearchResponse {
  items: GitHubSearchRepository[]
}

interface GitHubContentResponse {
  content?: string
  encoding?: string
}

interface EnrichedBundlePackage {
  directory: string | null
  packageName: string | null
  packageVersion: string | null
  packageIntegrity: string | null
  bundlePatch: string | null
  compatibility: string | null
  packageManifest: Record<string, unknown>
}

interface RepositoryEnrichment {
  readmeExcerpt: string | null
  commitSha: string | null
  packages: EnrichedBundlePackage[]
  retryCount: number
}

export interface GitHubDiscoveryOptions extends SourceAdapterOptions {
  queries?: string[]
  token?: string
  perQuery?: number
  detailLimit?: number
  retries?: number
  concurrency?: number
  pagesPerQuery?: number
}

// Topics provide the strongest discovery signal. Keyword/README queries widen
// the candidate pool, but the enrichment and Bundle checks below still remove
// generic repositories before any install evidence is issued.
const defaultQueries = [
  'topic:dsh-plugin',
  'topic:deepseek-harness-plugin',
  '"deepseek harness" plugin in:name,description,readme',
  'dsh plugin in:name,description,readme',
]

export class GitHubDiscoveryAdapter implements SourceAggregationAdapter {
  private readonly fetcher: typeof fetch
  private readonly clock: () => Date
  private readonly queries: string[]
  private readonly token?: string
  private readonly perQuery: number
  private readonly detailLimit: number
  private readonly retries: number
  private readonly concurrency: number
  private readonly pagesPerQuery: number

  constructor(options: GitHubDiscoveryOptions = {}) {
    this.fetcher = options.fetch ?? fetch
    this.clock = options.clock ?? (() => new Date())
    this.queries = options.queries?.length ? options.queries : defaultQueries
    this.token = options.token
    this.perQuery = Math.min(100, Math.max(1, options.perQuery ?? 50))
    // An authenticated server can inspect the full GitHub Search window. An
    // anonymous Desktop refresh deliberately remains small to avoid consuming
    // the public Search API quota or replacing a healthy server snapshot.
    this.detailLimit = Math.min(1_000, Math.max(0, options.detailLimit ?? (this.token ? 1_000 : 12)))
    this.retries = Math.min(3, Math.max(0, options.retries ?? 2))
    this.concurrency = Math.min(6, Math.max(1, options.concurrency ?? 4))
    this.pagesPerQuery = Math.min(10, Math.max(1, options.pagesPerQuery ?? (this.token ? 10 : 1)))
  }

  async discover(): Promise<PublicSourceCandidate[]> {
    // GitHub search has a separate, low anonymous quota. Limit concurrency and
    // keep successful query pages when one broad query is rejected or limited.
    const searches = await this.mapWithConcurrency(
      this.queries,
      async (query) => {
        try { return { items: await this.search(query), error: null as unknown } } catch (error) {
          return { items: [] as GitHubSearchRepository[], error }
        }
      },
      Math.min(2, this.concurrency),
    )
    const batches = searches.map(({ items }) => items)
    if (batches.every((items) => items.length === 0)) {
      const error = searches.find((result) => result.error)?.error
      if (error) throw error
    }
    const unique = new Map<string, GitHubSearchRepository>()
    for (const repository of batches.flat()) unique.set(repository.full_name.toLowerCase(), repository)
    const repositories = [...unique.values()].sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at) || left.full_name.localeCompare(right.full_name),
    )
    const enriched = await this.mapWithConcurrency(repositories, async (repository, index) => ({
      repository,
      candidates: await this.toCandidates(repository, index < this.detailLimit),
    }))
    return enriched
      .flatMap(({ repository, candidates }) => candidates.filter((candidate) =>
        this.isDshCandidate(repository, candidate) && this.isInstallableBundle(candidate),
      ))
      .sort((left, right) => left.repository.localeCompare(right.repository))
  }

  private async search(query: string): Promise<GitHubSearchRepository[]> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    }
    if (typeof window === 'undefined') headers['User-Agent'] = 'HarnessHub-Registry-Aggregator'
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    const items: GitHubSearchRepository[] = []
    for (let page = 1; page <= this.pagesPerQuery; page += 1) {
      const url = new URL('https://api.github.com/search/repositories')
      url.searchParams.set('q', query)
      url.searchParams.set('sort', 'updated')
      url.searchParams.set('order', 'desc')
      url.searchParams.set('per_page', String(this.perQuery))
      url.searchParams.set('page', String(page))
      const response = await this.withRetry(() => fetchJson<GitHubSearchResponse>(this.fetcher, url.toString(), headers))
      items.push(...response.items)
      if (response.items.length < this.perQuery) break
    }
    return items
  }

  private async toCandidates(repository: GitHubSearchRepository, enrich: boolean): Promise<PublicSourceCandidate[]> {
    const discoveredAt = this.clock().toISOString()
    let readmeExcerpt: string | null = null
    let commitSha: string | null = null
    let packages: EnrichedBundlePackage[] = [{
      directory: null,
      packageName: null,
      packageVersion: null,
      packageIntegrity: null,
      bundlePatch: null,
      compatibility: null,
      packageManifest: {},
    }]
    let retryCount = 0
    let lastError: string | null = null

    if (enrich) {
      try {
        const details = await this.enrich(repository)
        readmeExcerpt = details.readmeExcerpt
        commitSha = details.commitSha
        packages = details.packages
        retryCount = details.retryCount
      } catch (error) {
        retryCount = this.retries
        lastError = error instanceof Error ? error.message.slice(0, 500) : 'Source enrichment failed.'
      }
    }
    return Promise.all(packages.map(async (candidatePackage) => {
      const assessment = classifyCandidate({
        name: candidatePackage.packageName ?? repository.name,
        description: repository.description ?? '',
        readme: readmeExcerpt,
        topics: repository.topics,
        packageManifest: candidatePackage.packageManifest,
        hasFixedVersion: Boolean(candidatePackage.packageVersion),
        hasIntegrity: Boolean(candidatePackage.packageIntegrity?.startsWith('sha512-')),
        hasCommit: Boolean(commitSha),
        hasLicense: Boolean(repository.license?.spdx_id),
      })
      const canonical = JSON.stringify({
        external_id: `${repository.id}:${candidatePackage.directory ?? 'root'}`,
        repository: repository.full_name.toLowerCase(),
        bundle_directory: candidatePackage.directory,
        repository_url: repository.html_url,
        author: repository.owner.login,
        name: candidatePackage.packageName ?? repository.name,
        description: repository.description ?? '',
        default_branch: repository.default_branch,
        license_spdx: repository.license?.spdx_id ?? null,
        stars: repository.stargazers_count,
        upstream_updated_at: repository.updated_at,
        commit_sha: commitSha,
        package_name: candidatePackage.packageName,
        package_version: candidatePackage.packageVersion,
        package_integrity: candidatePackage.packageIntegrity,
        dsh_bundle_patch: candidatePackage.bundlePatch,
        dsh_compatibility: candidatePackage.compatibility,
        category: assessment.category,
        permissions: assessment.permissions,
        risk_level: assessment.riskLevel,
        risk_reasons: assessment.reasons,
        risk_model_version: CANDIDATE_RISK_MODEL_VERSION,
      })
      return {
        provider: 'github' as const,
        external_id: `${repository.id}:${candidatePackage.directory ?? 'root'}`,
        repository: repository.full_name,
        repository_url: repository.html_url,
        bundle_directory: candidatePackage.directory,
        author: repository.owner.login,
        name: candidatePackage.packageName ?? repository.name,
        description: repository.description ?? '',
        default_branch: repository.default_branch,
        readme_excerpt: readmeExcerpt,
        license_spdx: repository.license?.spdx_id ?? null,
        stars: repository.stargazers_count,
        upstream_updated_at: repository.updated_at,
        version: candidatePackage.packageVersion,
        commit_sha: commitSha,
        package_name: candidatePackage.packageName,
        package_integrity: candidatePackage.packageIntegrity,
        dsh_bundle_patch: candidatePackage.bundlePatch,
        dsh_compatibility: candidatePackage.compatibility,
        category: assessment.category,
        permissions: assessment.permissions,
        risk_level: assessment.riskLevel,
        risk_reasons: assessment.reasons,
        risk_assessed_at: discoveredAt,
        risk_model_version: CANDIDATE_RISK_MODEL_VERSION,
        metadata_sha256: await this.sha256(canonical),
        discovered_at: discoveredAt,
        status: 'COLLECTED_UNVERIFIED' as const,
        retry_count: retryCount,
        last_error: lastError,
      }
    }))
  }

  private async enrich(repository: GitHubSearchRepository): Promise<RepositoryEnrichment> {
    const headers = this.githubHeaders()
    const base = `https://api.github.com/repos/${repository.full_name}`
    let attempts = 0
    const commit = await this.withRetry(async () => {
      attempts += 1
      return fetchJson<{ sha: string }>(this.fetcher, `${base}/commits/${encodeURIComponent(repository.default_branch)}`, headers)
    })
    const ref = /^[a-f0-9]{40}$/.test(commit.sha) ? commit.sha : repository.default_branch
    const [readme, packageManifest] = await Promise.all([
      this.optionalGitHubContent(`${base}/readme?ref=${encodeURIComponent(ref)}`, headers, () => { attempts += 1 }),
      this.optionalGitHubContent(`${base}/contents/package.json?ref=${encodeURIComponent(ref)}`, headers, () => { attempts += 1 }),
    ])
    const readmeText = this.decodeContent(readme)
    const packageText = this.decodeContent(packageManifest)
    let manifest: Record<string, unknown> = {}
    if (packageText) {
      try { manifest = JSON.parse(packageText) as Record<string, unknown> } catch { manifest = {} }
    }
    const directories = this.bundleDirectories(manifest)
    const nested = await this.mapWithConcurrency(directories, async (directory) => {
      const content = await this.optionalGitHubContent(
        `${base}/contents/${directory}/package.json?ref=${encodeURIComponent(ref)}`,
        headers,
        () => { attempts += 1 },
      )
      return { directory, manifest: this.parseManifest(this.decodeContent(content)) }
    })
    const packages = await this.mapWithConcurrency(
      [{ directory: null, manifest }, ...nested],
      ({ directory, manifest: bundleManifest }) => this.enrichBundlePackage(base, ref, headers, directory, bundleManifest, () => { attempts += 1 }),
    )
    return {
      readmeExcerpt: readmeText ? readmeText.replace(/\s+/g, ' ').trim().slice(0, 4000) : null,
      commitSha: /^[a-f0-9]{40}$/.test(commit.sha) ? commit.sha : null,
      packages,
      retryCount: Math.max(0, attempts - 3),
    }
  }

  private async enrichBundlePackage(
    base: string,
    ref: string,
    headers: Record<string, string>,
    directory: string | null,
    manifest: Record<string, unknown>,
    onAttempt: () => void,
  ): Promise<EnrichedBundlePackage> {
    const packageName = typeof manifest.name === 'string' ? manifest.name : null
    const declaredVersion = typeof manifest.version === 'string' ? manifest.version : null
    const sourcePatch = this.bundlePatch(manifest)
    const sourcePatchExists = sourcePatch
      ? await this.githubFileExists(base, directory, sourcePatch, ref, headers, onAttempt)
      : false
    const compatibility = this.compatibility(manifest)
    // Do not silently switch to npm's newest version: the GitHub snapshot must
    // identify the exact package version that is later downloaded.
    const npm = packageName && declaredVersion
      ? await this.npmMetadata(packageName, declaredVersion).catch(() => null)
      : null
    const npmPatch = npm ? this.bundlePatch(npm.packageManifest) : null
    const npmMatchesSource = Boolean(
      npm
      && npm.integrity?.startsWith('sha512-')
      && sourcePatch
      && sourcePatchExists
      && npmPatch === sourcePatch,
    )
    return {
      directory,
      packageName,
      packageVersion: npmMatchesSource ? npm?.version ?? null : null,
      packageIntegrity: npmMatchesSource ? npm?.integrity ?? null : null,
      bundlePatch: npmMatchesSource ? sourcePatch : null,
      compatibility: compatibility ?? npm?.compatibility ?? null,
      packageManifest: manifest,
    }
  }

  private parseManifest(content: string | null): Record<string, unknown> {
    if (!content) return {}
    try { return JSON.parse(content) as Record<string, unknown> } catch { return {} }
  }

  private bundleDirectories(manifest: Record<string, unknown>): string[] {
    const dsh = manifest.dsh
    if (!dsh || typeof dsh !== 'object' || Array.isArray(dsh)) return []
    const bundles = (dsh as Record<string, unknown>).bundles
    if (!Array.isArray(bundles)) return []
    return [...new Set(bundles.flatMap((value) => {
      if (typeof value !== 'string') return []
      const normalized = value.trim().replace(/^\.\//, '').replace(/\/+$/, '')
      if (!normalized || value.includes('\\') || normalized.split('/').includes('..')) return []
      return [normalized]
    }))]
  }

  private async npmMetadata(packageName: string, version: string): Promise<{
    version: string
    integrity: string | null
    compatibility: string | null
    packageManifest: Record<string, unknown>
  }> {
    const encoded = packageName.startsWith('@') ? `@${encodeURIComponent(packageName.slice(1))}` : encodeURIComponent(packageName)
    const metadata = await this.withRetry(() => fetchJson<{
      'dist-tags'?: { latest?: string }
      versions?: Record<string, Record<string, unknown> & {
        dist?: { integrity?: string }
        peerDependencies?: Record<string, string>
        engines?: Record<string, string>
      }>
    }>(this.fetcher, `https://registry.npmjs.org/${encoded}`))
    if (!version) throw new Error('GitHub package.json has no fixed version.')
    const selected = metadata.versions?.[version]
    if (!selected) throw new Error('The GitHub package version is not published on npm.')
    return {
      version,
      integrity: selected?.dist?.integrity ?? null,
      compatibility: selected?.peerDependencies?.['@deepseek-ai/dsh'] ?? selected?.engines?.dsh ?? null,
      packageManifest: selected ?? {},
    }
  }

  private compatibility(manifest: Record<string, unknown>): string | null {
    const peer = manifest.peerDependencies
    if (peer && typeof peer === 'object' && typeof (peer as Record<string, unknown>)['@deepseek-ai/dsh'] === 'string') {
      return (peer as Record<string, string>)['@deepseek-ai/dsh'] ?? null
    }
    const engines = manifest.engines
    if (engines && typeof engines === 'object' && typeof (engines as Record<string, unknown>).dsh === 'string') {
      return (engines as Record<string, string>).dsh ?? null
    }
    return null
  }

  /**
   * Discovery may include repositories that merely mention DSH. A package is
   * eligible for the Desktop install path only when its own immutable package
   * manifest declares a relative DSH bundle patch. This is an installability
   * fact, not a trust or safety judgement.
   */
  private bundlePatch(manifest: Record<string, unknown>): string | null {
    const dsh = manifest.dsh
    if (!dsh || typeof dsh !== 'object' || Array.isArray(dsh)) return null
    const bundle = (dsh as Record<string, unknown>).bundle
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return null
    const patch = (bundle as Record<string, unknown>).patch
    if (typeof patch !== 'string' || !patch.trim()) return null
    const normalized = patch.trim()
    if (!normalized.startsWith('./') || normalized.includes('\\') || normalized.split('/').includes('..')) return null
    return normalized
  }

  private async optionalGitHubContent(
    url: string,
    headers: Record<string, string>,
    onAttempt: () => void,
  ): Promise<GitHubContentResponse | null> {
    try {
      return await this.withRetry(async () => {
        onAttempt()
        return fetchJson<GitHubContentResponse>(this.fetcher, url, headers)
      })
    } catch {
      return null
    }
  }

  private async githubFileExists(
    base: string,
    directory: string | null,
    patch: string,
    ref: string,
    headers: Record<string, string>,
    onAttempt: () => void,
  ): Promise<boolean> {
    const encodedPath = [...(directory ? directory.split('/') : []), ...patch.replace(/^\.\//, '').split('/')]
      .map(encodeURIComponent)
      .join('/')
    const content = await this.optionalGitHubContent(
      `${base}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      headers,
      onAttempt,
    )
    return Boolean(content && this.decodeContent(content) !== null)
  }

  private decodeContent(value: { content?: string; encoding?: string } | null): string | null {
    if (!value?.content || value.encoding !== 'base64') return null
    const bytes = Uint8Array.from(atob(value.content.replace(/\s/g, '')), (character) => character.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  private async sha256(value: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  private isDshCandidate(repository: GitHubSearchRepository, candidate: PublicSourceCandidate): boolean {
    const topics = new Set((repository.topics ?? []).map((topic) => topic.toLowerCase()))
    if (topics.has('dsh-plugin') || topics.has('deepseek-harness') || topics.has('deepseek-harness-plugin')) return true
    const name = repository.name.toLowerCase()
    if (/^(dsh[-_])|([-_]dsh(?:[-_]|$))/.test(name)) return true
    const text = [
      repository.description,
      candidate.package_name,
      candidate.readme_excerpt,
    ].filter(Boolean).join(' ').toLowerCase()
    return text.includes('@deepseek-ai/dsh') || text.includes('deepseek harness') || /\bdsh[- ]plugin\b/.test(text)
  }

  private isInstallableBundle(candidate: PublicSourceCandidate): boolean {
    // A GitHub topic or README mention is discovery evidence only. The public
    // marketplace must contain real DSH Bundles whose exact source and npm
    // package can be reproduced by the controlled installer.
    return Boolean(
      candidate.commit_sha
      && candidate.package_name
      && candidate.version
      && candidate.package_integrity?.startsWith('sha512-')
      && candidate.dsh_bundle_patch,
    )
  }

  private githubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    }
    if (typeof window === 'undefined') headers['User-Agent'] = 'HarnessHub-Registry-Aggregator'
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    return headers
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let error: unknown
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try { return await operation() } catch (reason) {
        error = reason
        if (attempt >= this.retries || !this.retryable(reason)) break
        const requested = reason instanceof SourceFetchError ? reason.retryAfterMs : null
        const delay = requested ?? 250 * 2 ** attempt
        // A UI refresh must never sleep until a distant quota reset. Cached
        // candidates remain visible and the user can retry after GitHub resets.
        if (delay > 5_000) break
        await new Promise((resolve) => setTimeout(resolve, Math.max(100, delay)))
      }
    }
    throw error
  }

  private retryable(error: unknown): boolean {
    if (!(error instanceof SourceFetchError)) return true
    if (error.status === 403) return error.retryAfterMs !== null
    return error.status === 408
      || error.status === 425
      || error.status === 429
      || error.status >= 500
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    operation: (item: T, index: number) => Promise<R>,
    concurrency = this.concurrency,
  ): Promise<R[]> {
    const results = new Array<R>(items.length)
    let cursor = 0
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        const item = items[index]
        if (item !== undefined) results[index] = await operation(item, index)
      }
    })
    await Promise.all(workers)
    return results
  }
}
