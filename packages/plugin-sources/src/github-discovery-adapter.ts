import { createHash } from 'node:crypto'

import { fetchJson } from './http.js'
import type {
  PublicSourceCandidate,
  SourceAdapterOptions,
  SourceAggregationAdapter,
} from './types.js'

interface GitHubSearchRepository {
  id: number
  full_name: string
  html_url: string
  description: string | null
  default_branch: string
  owner: { login: string }
  license: { spdx_id: string } | null
}

interface GitHubSearchResponse {
  items: GitHubSearchRepository[]
}

export interface GitHubDiscoveryOptions extends SourceAdapterOptions {
  queries?: string[]
  token?: string
  perQuery?: number
}

const defaultQueries = [
  'topic:deepseek-harness',
  'deepseek-harness plugin in:name,description,readme',
]

export class GitHubDiscoveryAdapter implements SourceAggregationAdapter {
  private readonly fetcher: typeof fetch
  private readonly clock: () => Date
  private readonly queries: string[]
  private readonly token?: string
  private readonly perQuery: number

  constructor(options: GitHubDiscoveryOptions = {}) {
    this.fetcher = options.fetch ?? fetch
    this.clock = options.clock ?? (() => new Date())
    this.queries = options.queries?.length ? options.queries : defaultQueries
    this.token = options.token
    this.perQuery = Math.min(50, Math.max(1, options.perQuery ?? 20))
  }

  async discover(): Promise<PublicSourceCandidate[]> {
    const batches = await Promise.all(this.queries.map((query) => this.search(query)))
    const unique = new Map<string, PublicSourceCandidate>()
    for (const candidate of batches.flat()) unique.set(candidate.repository.toLowerCase(), candidate)
    return [...unique.values()].sort((left, right) => left.repository.localeCompare(right.repository))
  }

  private async search(query: string): Promise<PublicSourceCandidate[]> {
    const url = new URL('https://api.github.com/search/repositories')
    url.searchParams.set('q', query)
    url.searchParams.set('sort', 'updated')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', String(this.perQuery))
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'HarnessHub-Registry-Aggregator',
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    const response = await fetchJson<GitHubSearchResponse>(this.fetcher, url.toString(), headers)
    const discoveredAt = this.clock().toISOString()
    return response.items.map((repository) => {
      const canonical = JSON.stringify({
        external_id: String(repository.id),
        repository: repository.full_name,
        repository_url: repository.html_url,
        author: repository.owner.login,
        description: repository.description ?? '',
        default_branch: repository.default_branch,
        license_spdx: repository.license?.spdx_id ?? null,
      })
      return {
        provider: 'github',
        external_id: String(repository.id),
        repository: repository.full_name,
        repository_url: repository.html_url,
        author: repository.owner.login,
        description: repository.description ?? '',
        default_branch: repository.default_branch,
        license_spdx: repository.license?.spdx_id ?? null,
        version: null,
        commit_sha: null,
        package_integrity: null,
        metadata_sha256: createHash('sha256').update(canonical).digest('hex'),
        discovered_at: discoveredAt,
        status: 'COLLECTED_UNVERIFIED',
      }
    })
  }
}
