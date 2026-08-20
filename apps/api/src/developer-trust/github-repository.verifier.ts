import { Injectable } from '@nestjs/common'

import type { SourceOwnerType } from '@harnesshub/types'

export interface GitHubRepositoryIdentity {
  externalId: string
  canonicalUrl: string
  fullName: string
  defaultBranch: string
  ownerType: SourceOwnerType
  ownerExternalId: string
  private: boolean
  archived: boolean
}

export interface GitHubChallengeObservation {
  content: string
  blobSha: string
  commitSha: string
  observedAt: Date
}

export interface GitHubRepositoryVerifier {
  describe(repositoryUrl: string): Promise<GitHubRepositoryIdentity>
  observe(
    repository: GitHubRepositoryIdentity,
    challengePath: string,
    sourceRef: string,
  ): Promise<GitHubChallengeObservation>
}

export const GITHUB_REPOSITORY_VERIFIER = Symbol('GITHUB_REPOSITORY_VERIFIER')

export class GitHubVerificationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_REPOSITORY_URL'
      | 'REPOSITORY_NOT_FOUND'
      | 'CHALLENGE_NOT_FOUND'
      | 'GITHUB_UNAVAILABLE'
      | 'INVALID_GITHUB_RESPONSE',
  ) {
    super(code)
  }
}

function repositoryPath(repositoryUrl: string): { owner: string; repo: string } {
  let url: URL
  try {
    url = new URL(repositoryUrl)
  } catch {
    throw new GitHubVerificationError('INVALID_REPOSITORY_URL')
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.search || url.hash) {
    throw new GitHubVerificationError('INVALID_REPOSITORY_URL')
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new GitHubVerificationError('INVALID_REPOSITORY_URL')
  }
  const repo = parts[1].replace(/\.git$/i, '')
  if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new GitHubVerificationError('INVALID_REPOSITORY_URL')
  }
  return { owner: parts[0], repo }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numericId(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null
}

@Injectable()
export class PublicGitHubRepositoryVerifier implements GitHubRepositoryVerifier {
  async describe(repositoryUrl: string): Promise<GitHubRepositoryIdentity> {
    const { owner, repo } = repositoryPath(repositoryUrl)
    const data = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, 'repository')
    const object = data as Record<string, unknown>
    const ownerData = object.owner as Record<string, unknown> | undefined
    const externalId = numericId(object.id)
    const ownerExternalId = numericId(ownerData?.id)
    const ownerKind = ownerData?.type
    const ownerType = ownerKind === 'User' ? 'USER' : ownerKind === 'Organization' ? 'ORGANIZATION' : null
    const canonicalUrl = text(object.html_url)
    const fullName = text(object.full_name)
    const defaultBranch = text(object.default_branch)
    if (!externalId || !ownerExternalId || !ownerType || !canonicalUrl || !fullName || !defaultBranch) {
      throw new GitHubVerificationError('INVALID_GITHUB_RESPONSE')
    }
    return {
      externalId,
      canonicalUrl,
      fullName,
      defaultBranch,
      ownerType,
      ownerExternalId,
      private: object.private === true,
      archived: object.archived === true,
    }
  }

  async observe(
    repository: GitHubRepositoryIdentity,
    challengePath: string,
    sourceRef: string,
  ): Promise<GitHubChallengeObservation> {
    if (!/^\.harnesshub\/claims\/[0-9a-f-]{36}\.txt$/.test(challengePath)) {
      throw new GitHubVerificationError('CHALLENGE_NOT_FOUND')
    }
    const encodedPath = challengePath.split('/').map(encodeURIComponent).join('/')
    const content = (await this.request(
      `/repos/${repository.fullName}/contents/${encodedPath}?ref=${encodeURIComponent(sourceRef)}`,
      'challenge',
    )) as Record<string, unknown>
    if (content.type !== 'file' || content.encoding !== 'base64' || typeof content.content !== 'string') {
      throw new GitHubVerificationError('INVALID_GITHUB_RESPONSE')
    }
    if (typeof content.size !== 'number' || content.size < 1 || content.size > 4096) {
      throw new GitHubVerificationError('INVALID_GITHUB_RESPONSE')
    }
    const blobSha = text(content.sha)
    if (!blobSha || !/^[a-f0-9]{40}$/.test(blobSha)) {
      throw new GitHubVerificationError('INVALID_GITHUB_RESPONSE')
    }
    let decoded: string
    try {
      decoded = Buffer.from(content.content.replace(/\s/g, ''), 'base64').toString('utf8')
    } catch {
      throw new GitHubVerificationError('INVALID_GITHUB_RESPONSE')
    }
    const commits = (await this.request(
      `/repos/${repository.fullName}/commits?path=${encodeURIComponent(challengePath)}&sha=${encodeURIComponent(sourceRef)}&per_page=1`,
      'commit',
    )) as unknown[]
    const commitSha = Array.isArray(commits) ? text((commits[0] as Record<string, unknown> | undefined)?.sha) : null
    if (!commitSha || !/^[a-f0-9]{40}$/.test(commitSha)) {
      throw new GitHubVerificationError('INVALID_GITHUB_RESPONSE')
    }
    return { content: decoded, blobSha, commitSha, observedAt: new Date() }
  }

  private async request(path: string, kind: 'repository' | 'challenge' | 'commit'): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'HarnessHub-Developer-Trust',
        },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new GitHubVerificationError('GITHUB_UNAVAILABLE')
    }
    if (response.status === 404) {
      throw new GitHubVerificationError(kind === 'challenge' ? 'CHALLENGE_NOT_FOUND' : 'REPOSITORY_NOT_FOUND')
    }
    if (!response.ok) throw new GitHubVerificationError('GITHUB_UNAVAILABLE')
    try {
      return await response.json()
    } catch {
      throw new GitHubVerificationError('INVALID_GITHUB_RESPONSE')
    }
  }
}
