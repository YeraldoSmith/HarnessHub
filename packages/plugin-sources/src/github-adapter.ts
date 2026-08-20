import { createHash } from 'node:crypto'

import { fetchJson, fetchText, SourceFetchError } from './http.js'
import type { GitHubSourceResult, SourceAdapterOptions } from './types.js'

interface GitHubRepositoryResponse {
  default_branch: string
  description: string | null
  html_url: string
  owner: { login: string }
  license: { spdx_id: string } | null
}

interface GitHubCommitResponse {
  sha: string
}

interface GitHubReleaseResponse {
  tag_name: string
}

interface GitHubTagResponse {
  name: string
}

interface PackageManifest extends Record<string, unknown> {
  name?: unknown
  version?: unknown
  description?: unknown
  license?: unknown
  dsh?: unknown
}

export class GitHubSourceAdapter {
  private readonly fetchImpl: typeof fetch
  private readonly clock: () => Date

  constructor(options: SourceAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch
    this.clock = options.clock ?? (() => new Date())
  }

  async fetch(repository: string, requestedRef?: string): Promise<GitHubSourceResult> {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      throw new Error(`Invalid GitHub repository '${repository}'.`)
    }

    const apiBase = `https://api.github.com/repos/${repository}`
    const headers = this.headers('application/vnd.github+json')
    const repo = await fetchJson<GitHubRepositoryResponse>(this.fetchImpl, apiBase, headers)
    const ref = requestedRef ?? repo.default_branch
    const commit = await fetchJson<GitHubCommitResponse>(
      this.fetchImpl,
      `${apiBase}/commits/${encodeURIComponent(ref)}`,
      headers,
    )

    if (!/^[a-f0-9]{40}$/.test(commit.sha)) {
      throw new Error(`GitHub returned an invalid commit SHA for '${repository}'.`)
    }

    const rawHeaders = this.headers('application/vnd.github.raw+json')
    const [readme, manifestText, releaseTag] = await Promise.all([
      fetchText(this.fetchImpl, `${apiBase}/readme?ref=${commit.sha}`, rawHeaders),
      fetchText(this.fetchImpl, `${apiBase}/contents/package.json?ref=${commit.sha}`, rawHeaders),
      this.fetchReleaseTag(apiBase),
    ])
    const packageManifest = JSON.parse(manifestText) as PackageManifest

    this.assertBundle(packageManifest, repository)

    const fetchedAt = this.clock().toISOString()
    const licenseSpdx = this.normalizeLicense(repo.license?.spdx_id, packageManifest.license)

    return {
      provider: 'github',
      repository,
      repository_url: repo.html_url,
      owner: repo.owner.login,
      description:
        typeof packageManifest.description === 'string'
          ? packageManifest.description
          : (repo.description ?? ''),
      default_branch: repo.default_branch,
      commit_sha: commit.sha,
      release_tag: releaseTag,
      license_spdx: licenseSpdx,
      readme_excerpt: readme.replace(/\s+/g, ' ').trim().slice(0, 500),
      package_manifest: packageManifest,
      evidence: {
        provider: 'github',
        url: `${repo.html_url}/tree/${commit.sha}`,
        repository_url: repo.html_url,
        package_name: null,
        fetched_at: fetchedAt,
        commit_sha: commit.sha,
        release_tag: releaseTag,
        npm_version: null,
        integrity: null,
        readme_sha256: createHash('sha256').update(readme).digest('hex'),
        license_spdx: licenseSpdx,
      },
    }
  }

  private headers(accept: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'HarnessHub-Registry/0.1',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    const token = process.env.GITHUB_TOKEN
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  private async fetchReleaseTag(apiBase: string): Promise<string | null> {
    const headers = this.headers('application/vnd.github+json')
    try {
      const release = await fetchJson<GitHubReleaseResponse>(
        this.fetchImpl,
        `${apiBase}/releases/latest`,
        headers,
      )
      return release.tag_name
    } catch (error) {
      if (!(error instanceof SourceFetchError) || error.status !== 404) throw error
    }

    const tags = await fetchJson<GitHubTagResponse[]>(
      this.fetchImpl,
      `${apiBase}/tags?per_page=20`,
      headers,
    )
    const tagAtCommit = tags.find((tag) => tag.name.length > 0)
    return tagAtCommit?.name ?? null
  }

  private assertBundle(manifest: PackageManifest, repository: string): void {
    const dsh = manifest.dsh
    if (!dsh || typeof dsh !== 'object') {
      throw new Error(`Repository '${repository}' does not declare dsh.bundle.`)
    }
    const bundle = (dsh as { bundle?: unknown }).bundle
    const patch = bundle && typeof bundle === 'object' ? (bundle as { patch?: unknown }).patch : undefined
    if (typeof patch !== 'string' || !patch.trim()) {
      throw new Error(`Repository '${repository}' does not declare a valid dsh.bundle.patch.`)
    }
  }

  private normalizeLicense(repositoryLicense?: string, manifestLicense?: unknown): string | null {
    const manifestValue = typeof manifestLicense === 'string' ? manifestLicense : null
    const value = manifestValue ?? repositoryLicense ?? null
    return value && value !== 'NOASSERTION' ? value : null
  }
}
