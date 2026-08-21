import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { PluginSnapshot } from '@harnesshub/types'
import type { PublicSourceCandidate } from '@harnesshub/plugin-sources'

import { AuthConfig } from '../auth/auth.config.js'
import { AuthService } from '../auth/auth.service.js'
import type { GitHubIdentity, GitHubOAuthGateway } from '../auth/github-oauth.client.js'
import { PrismaAuthRepository } from '../auth/prisma-auth.repository.js'
import { PrismaService } from '../database/prisma.service.js'
import { DeveloperTrustConfig } from '../developer-trust/developer-trust.config.js'
import { DeveloperTrustService } from '../developer-trust/developer-trust.service.js'
import {
  GitHubVerificationError,
  type GitHubChallengeObservation,
  type GitHubRepositoryIdentity,
  type GitHubRepositoryVerifier,
} from '../developer-trust/github-repository.verifier.js'
import { PrismaDeveloperTrustRepository } from '../developer-trust/prisma-developer-trust.repository.js'
import { PrismaCandidatePluginRepository } from '../discovery/prisma-candidate-plugin.repository.js'
import { PrismaSyncJobRepository } from '../sync/prisma-sync-job.repository.js'
import { PrismaPluginRepository } from './prisma-plugin.repository.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests.')
}
if (!testDatabaseUrl.includes('schema=harnesshub_test')) {
  throw new Error("TEST_DATABASE_URL must target the isolated 'harnesshub_test' schema.")
}

process.env.DATABASE_URL = testDatabaseUrl
process.env.GITHUB_CLIENT_ID = 'integration-client-id'
process.env.GITHUB_CLIENT_SECRET = 'integration-client-secret'
process.env.GITHUB_CALLBACK_URL = 'http://127.0.0.1:3001/auth/github/callback'
process.env.SESSION_SECRET = 'integration-session-secret-that-is-longer-than-32-bytes'
process.env.DEVELOPER_CLAIM_TTL_SECONDS = '86400'

const prisma = new PrismaService()
const repository = new PrismaPluginRepository(prisma)
const syncJobs = new PrismaSyncJobRepository(prisma)
const authRepository = new PrismaAuthRepository(prisma)
const developerTrustRepository = new PrismaDeveloperTrustRepository(prisma)
const candidateRepository = new PrismaCandidatePluginRepository(prisma)

class FakeRepositoryVerifier implements GitHubRepositoryVerifier {
  readonly observations = new Map<string, GitHubChallengeObservation>()

  async describe(repositoryUrl: string): Promise<GitHubRepositoryIdentity> {
    return {
      externalId: '501001',
      canonicalUrl: repositoryUrl,
      fullName: 'example/integration-registry-plugin',
      defaultBranch: 'main',
      ownerType: 'ORGANIZATION',
      ownerExternalId: '701001',
      private: false,
      archived: false,
    }
  }

  async observe(
    _repository: GitHubRepositoryIdentity,
    challengePath: string,
    _sourceRef: string,
  ): Promise<GitHubChallengeObservation> {
    const observation = this.observations.get(challengePath)
    if (!observation) throw new GitHubVerificationError('CHALLENGE_NOT_FOUND')
    return observation
  }
}

const fakeRepositoryVerifier = new FakeRepositoryVerifier()
const developerTrust = new DeveloperTrustService(
  new DeveloperTrustConfig(),
  developerTrustRepository,
  fakeRepositoryVerifier,
)

const githubIdentities: Record<string, GitHubIdentity> = {
  'ordinary-code': {
    providerUserId: '900001',
    login: 'ordinary-developer',
    avatarUrl: null,
    profileUrl: 'https://github.com/ordinary-developer',
  },
  'founder-code': {
    providerUserId: '120692294',
    login: 'founder-renamed-login',
    avatarUrl: null,
    profileUrl: 'https://github.com/founder-renamed-login',
  },
  'impostor-code': {
    providerUserId: '900002',
    login: 'YeraldoSmith',
    avatarUrl: null,
    profileUrl: 'https://github.com/YeraldoSmith',
  },
  'similar-code': {
    providerUserId: '900003',
    login: 'YeraldoSrnith',
    avatarUrl: null,
    profileUrl: 'https://github.com/YeraldoSrnith',
  },
  'desktop-code': {
    providerUserId: '900004',
    login: 'desktop-user',
    avatarUrl: null,
    profileUrl: 'https://github.com/desktop-user',
  },
}

const fakeGitHub: GitHubOAuthGateway = {
  authorizationUrl(state, challenge) {
    const url = new URL('https://github.test/login/oauth/authorize')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  },
  async authenticate(code) {
    const identity = githubIdentities[code]
    if (!identity) throw new Error('Unknown integration authorization code.')
    return identity
  },
}

const auth = new AuthService(new AuthConfig(), authRepository, fakeGitHub)

async function completeWeb(code: string) {
  const authorizationUrl = await auth.startWeb()
  const url = new URL(authorizationUrl)
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  return auth.complete(code, url.searchParams.get('state') ?? undefined)
}
const snapshot: PluginSnapshot = {
  checked_at: '2026-08-20T03:00:00.000Z',
  plugin: {
    id: 'integration-registry-plugin',
    name: 'Integration Registry Plugin',
    description: 'A non-production record used only in the isolated integration-test schema.',
    source: 'github+npm',
    github_url: 'https://github.com/example/integration-registry-plugin',
    npm_url: 'https://www.npmjs.com/package/@example/integration-registry-plugin/v/1.0.0',
    author: { name: 'example', handle: 'example' },
    version: '1.0.0',
    category: 'Testing',
    tags: ['integration', 'testing'],
    permissions: [],
    compatibility: { dsh: '>=0.1.0-rc.6 <0.2.0', status: 'declared' },
    license: { spdx: 'MIT', name: 'MIT', url: 'https://spdx.org/licenses/MIT.html' },
    source_commit: 'b'.repeat(40),
    npm_version: '1.0.0',
    checked_at: '2026-08-20T03:00:00.000Z',
    source_evidence: [
      {
        provider: 'github',
        url: `https://github.com/example/integration-registry-plugin/tree/${'b'.repeat(40)}`,
        repository_url: 'https://github.com/example/integration-registry-plugin',
        package_name: null,
        fetched_at: '2026-08-20T03:00:00.000Z',
        commit_sha: 'b'.repeat(40),
        release_tag: 'v1.0.0',
        npm_version: null,
        integrity: null,
        readme_sha256: 'c'.repeat(64),
        license_spdx: 'MIT',
      },
      {
        provider: 'npm',
        url: 'https://registry.npmjs.org/@example/integration-registry-plugin/-/integration-registry-plugin-1.0.0.tgz',
        repository_url: 'https://github.com/example/integration-registry-plugin',
        package_name: '@example/integration-registry-plugin',
        fetched_at: '2026-08-20T03:00:00.000Z',
        commit_sha: null,
        release_tag: null,
        npm_version: '1.0.0',
        integrity: 'sha512-integration-test',
        readme_sha256: null,
        license_spdx: 'MIT',
      },
    ],
    source_status: [
      {
        provider: 'github',
        status: 'AVAILABLE',
        last_verified_at: '2026-08-20T03:00:00.000Z',
        unavailable_since: null,
        error: null,
      },
      {
        provider: 'npm',
        status: 'AVAILABLE',
        last_verified_at: '2026-08-20T03:00:00.000Z',
        unavailable_since: null,
        error: null,
      },
    ],
    is_mock: false,
  },
}

beforeAll(async () => {
  await prisma.$connect()
})

afterAll(async () => {
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "harnesshub_test" CASCADE')
  await prisma.$disconnect()
})

describe.sequential('PrismaPluginRepository', () => {
  it('deduplicates an immutable version while appending each source snapshot', async () => {
    await repository.saveSnapshot(snapshot)
    await repository.saveSnapshot({
      ...snapshot,
      checked_at: '2026-08-20T03:01:00.000Z',
      plugin: { ...snapshot.plugin, checked_at: '2026-08-20T03:01:00.000Z' },
    })

    await expect(prisma.plugin.count()).resolves.toBe(1)
    await expect(prisma.pluginVersion.count()).resolves.toBe(1)
    await expect(prisma.pluginSource.count()).resolves.toBe(2)
    await expect(prisma.pluginSnapshot.count()).resolves.toBe(2)
    await expect(repository.listSnapshots(snapshot.plugin.id)).resolves.toHaveLength(2)
  })

  it('rejects mutations of immutable version records', async () => {
    await expect(
      prisma.pluginVersion.updateMany({
        where: { pluginId: snapshot.plugin.id },
        data: { version: 'mutated' },
      }),
    ).rejects.toThrow('plugin_versions rows are immutable')
  })

  it('paginates and searches PostgreSQL fields including author and tags', async () => {
    await repository.saveSnapshot({
      ...snapshot,
      plugin: {
        ...snapshot.plugin,
        id: 'alpha-pagination-plugin',
        name: 'Alpha Pagination Plugin',
        author: { name: 'Pagination Author', handle: 'pagination-author' },
        tags: ['pagination', 'database'],
      },
    })

    const first = await repository.list({ page: 1, limit: 1 })
    const second = await repository.list({ page: 2, limit: 1 })
    const authorSearch = await repository.list({ query: 'Pagination Author', page: 1, limit: 20 })
    const tagSearch = await repository.list({ query: 'database', page: 1, limit: 20 })

    expect(first.total).toBe(2)
    expect(first.items).toHaveLength(1)
    expect(second.items).toHaveLength(1)
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id)
    expect(authorSearch.items.map((plugin) => plugin.id)).toEqual(['alpha-pagination-plugin'])
    expect(tagSearch.items.map((plugin) => plugin.id)).toEqual(['alpha-pagination-plugin'])
  })

  it('records SyncJob lifecycle transitions', async () => {
    const job = await syncJobs.create(snapshot.plugin.id, 'github+npm')
    await expect(syncJobs.start(job.id)).resolves.toMatchObject({ status: 'RUNNING' })
    await expect(syncJobs.fail(job.id, 'upstream timeout')).resolves.toMatchObject({
      status: 'FAILED',
      error: 'upstream timeout',
    })
    const successJob = await syncJobs.create(snapshot.plugin.id, 'github+npm')
    await syncJobs.start(successJob.id)
    await expect(syncJobs.succeed(successJob.id)).resolves.toMatchObject({
      status: 'SUCCESS',
      error: null,
    })
    const jobs = await syncJobs.list(snapshot.plugin.id)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: job.id, status: 'FAILED' }),
        expect.objectContaining({ id: successJob.id, status: 'SUCCESS' }),
      ]),
    )
  })

  it('marks an upstream source unavailable without deleting snapshots', async () => {
    const snapshotCount = await prisma.pluginSnapshot.count({
      where: { pluginVersion: { pluginId: snapshot.plugin.id } },
    })
    await expect(
      repository.markSourceUnavailable(snapshot.plugin.id, 'github', 'Source request failed with status 404.'),
    ).resolves.toBe(1)

    const plugin = await repository.getById(snapshot.plugin.id)
    expect(plugin?.source_status).toContainEqual(
      expect.objectContaining({ provider: 'github', status: 'UNAVAILABLE' }),
    )
    await expect(
      prisma.pluginSnapshot.count({ where: { pluginVersion: { pluginId: snapshot.plugin.id } } }),
    ).resolves.toBe(snapshotCount)
  })
})

describe.sequential('public plugin discovery candidates', () => {
  const candidate = (repositoryName: string): PublicSourceCandidate => ({
    provider: 'github',
    external_id: repositoryName,
    repository: repositoryName,
    repository_url: `https://github.com/${repositoryName}`,
    author: repositoryName.split('/')[0] ?? 'example',
    name: repositoryName.split('/')[1] ?? 'plugin',
    description: 'Automatically discovered candidate',
    default_branch: 'main',
    readme_excerpt: '# Candidate',
    license_spdx: 'MIT',
    stars: 12,
    upstream_updated_at: '2026-08-20T12:00:00.000Z',
    version: '1.0.0',
    commit_sha: 'c'.repeat(40),
    package_name: '@example/candidate',
    package_integrity: 'sha512-proof',
    dsh_compatibility: '^0.1.0',
    category: 'Coding',
    permissions: [],
    risk_level: 'LOW',
    risk_reasons: ['NO_HIGH_RISK_SIGNAL_DETECTED', 'AUTOMATED_ASSESSMENT'],
    risk_assessed_at: '2026-08-20T12:00:00.000Z',
    risk_model_version: 'hhrisk-1',
    metadata_sha256: 'd'.repeat(64),
    discovered_at: '2026-08-20T12:00:00.000Z',
    status: 'COLLECTED_UNVERIFIED',
    retry_count: 0,
    last_error: null,
  })

  it('deduplicates owner/repo case-insensitively and excludes published Registry sources', async () => {
    const newCandidate = candidate('PublicOrg/DSH-New-Plugin')
    await expect(candidateRepository.upsertMany([
      newCandidate,
      { ...newCandidate, repository: 'publicorg/dsh-new-plugin' },
      candidate('example/integration-registry-plugin'),
    ])).resolves.toBe(1)

    const result = await candidateRepository.list('', 20)
    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({
      repository: 'publicorg/dsh-new-plugin',
      status: 'COLLECTED_UNVERIFIED',
      stars: 12,
      category: 'Coding',
      risk_level: 'LOW',
    })
    await expect(prisma.candidatePluginSnapshot.count()).resolves.toBe(1)
  })

  it('keeps immutable candidate snapshots only when evidence changes', async () => {
    const first = candidate('PublicOrg/DSH-Snapshots')
    await candidateRepository.upsertMany([first])
    const stored = await prisma.candidatePlugin.findUniqueOrThrow({ where: { canonicalKey: 'publicorg/dsh-snapshots' } })
    await candidateRepository.upsertMany([first])
    await expect(prisma.candidatePluginSnapshot.count({ where: { candidatePluginId: stored.id } })).resolves.toBe(1)

    await candidateRepository.upsertMany([{ ...first, metadata_sha256: 'e'.repeat(64), risk_level: 'MEDIUM' }])
    await expect(prisma.candidatePluginSnapshot.count({ where: { candidatePluginId: stored.id } })).resolves.toBe(2)
  })
})

describe.sequential('GitHub OAuth identity foundation', () => {
  it('creates an ordinary user and stable GitHub OAuth identity without storing an OAuth token', async () => {
    const completed = await completeWeb('ordinary-code')

    expect(completed.session.user.github).toMatchObject({
      user_id: '900001',
      login: 'ordinary-developer',
    })
    expect(completed.session.user.public_id).toMatch(/^HH-\d{10}$/)
    expect(completed.session.user.roles).toEqual(['USER'])
    expect(completed.session.user.badges).toEqual([])
    await expect(
      prisma.oAuthIdentity.count({ where: { providerUserId: '900001' } }),
    ).resolves.toBe(1)
    const identity = await prisma.oAuthIdentity.findFirstOrThrow({
      where: { providerUserId: '900001' },
    })
    expect(JSON.stringify(identity.metadata)).not.toMatch(/access.token|email/i)
    const storedSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: completed.session.user.id },
    })
    expect(storedSession.tokenHash).not.toBe(completed.sessionToken)
    await expect(auth.session(completed.sessionToken)).resolves.toMatchObject({ authenticated: true })
  })

  it('grants Founder only to the bootstrapped numeric GitHub user ID, even after a login rename', async () => {
    const completed = await completeWeb('founder-code')

    expect(completed.session.user.github).toMatchObject({
      user_id: '120692294',
      login: 'founder-renamed-login',
    })
    expect(completed.session.user.roles).toContain('FOUNDER')
    expect(completed.session.user.badges).toContain('FOUNDER')
    expect(completed.session.user.public_id).toBe('HH-0000000001')
  })

  it.each([
    ['impostor-code', 'YeraldoSmith'],
    ['similar-code', 'YeraldoSrnith'],
  ])('never grants Founder to a different GitHub ID using login %s', async (code, login) => {
    const completed = await completeWeb(code)

    expect(completed.session.user.github.login).toBe(login)
    expect(completed.session.user.github.user_id).not.toBe('120692294')
    expect(completed.session.user.roles).not.toContain('FOUNDER')
    expect(completed.session.user.badges).not.toContain('FOUNDER')
  })

  it('consumes OAuth state exactly once and rejects callback replay', async () => {
    const authorizationUrl = await auth.startWeb()
    const state = new URL(authorizationUrl).searchParams.get('state') ?? undefined
    await auth.complete('ordinary-code', state)
    await expect(auth.complete('ordinary-code', state)).rejects.toThrow(/invalid, expired, or already used/i)
  })

  it('delivers a desktop session once without exposing a GitHub OAuth token', async () => {
    const started = await auth.startDesktop()
    const state = new URL(started.authorization_url).searchParams.get('state') ?? undefined
    await auth.complete('desktop-code', state)

    const delivered = await auth.exchangeDesktop(started.transaction_id, started.poll_token)
    expect(delivered).toMatchObject({ status: 'COMPLETE' })
    if (delivered.status !== 'COMPLETE') throw new Error('Desktop session was not completed.')
    expect(delivered.session.user.github.user_id).toBe('900004')
    await expect(auth.session(delivered.session_token)).resolves.toMatchObject({ authenticated: true })
    await expect(
      auth.exchangeDesktop(started.transaction_id, started.poll_token),
    ).rejects.toThrow(/already delivered/i)
  })
})

describe.sequential('Developer Trust foundation', () => {
  it('verifies an exact public-repository challenge and grants ownership, role, and badge atomically', async () => {
    const completed = await completeWeb('ordinary-code')
    await developerTrust.updateProfile(completed.session.user.id, {
      displayName: 'Ordinary Developer',
      bio: 'Integration test developer.',
      website: 'https://example.com/developer',
    })
    const started = await developerTrust.startClaim(completed.session.user.id, snapshot.plugin.id)
    fakeRepositoryVerifier.observations.set(started.challenge.path, {
      content: started.challenge.content,
      blobSha: 'd'.repeat(40),
      commitSha: 'e'.repeat(40),
      observedAt: new Date('2026-08-20T06:00:00.000Z'),
    })

    const verified = await developerTrust.verifyClaim(completed.session.user.id, started.claim.id)

    expect(verified.claim.status).toBe('APPROVED')
    expect(verified.ownership).toMatchObject({
      plugin_id: snapshot.plugin.id,
      user_id: completed.session.user.id,
      ownership_type: 'OWNER',
      repository_external_id: '501001',
    })
    expect(verified.badge).toBe('VERIFIED_DEVELOPER')
    const session = await auth.session(completed.sessionToken)
    expect(session).toMatchObject({
      authenticated: true,
      user: {
        roles: expect.arrayContaining(['DEVELOPER']),
        badges: expect.arrayContaining(['VERIFIED_DEVELOPER']),
      },
    })
    await expect(
      prisma.verificationEvidence.updateMany({
        where: { developerClaimId: started.claim.id },
        data: { commitSha: 'f'.repeat(40) },
      }),
    ).rejects.toThrow('verification_evidence rows are immutable')
    await expect(
      prisma.auditEvent.count({
        where: { targetId: started.claim.id, action: 'developer_claim.approved' },
      }),
    ).resolves.toBe(1)
  })

  it('rejects a non-owner proof and grants no ownership or badge to a similar username', async () => {
    const completed = await completeWeb('similar-code')
    await developerTrust.updateProfile(completed.session.user.id, {
      displayName: 'Similar Login',
      bio: null,
      website: null,
    })
    const started = await developerTrust.startClaim(completed.session.user.id, 'alpha-pagination-plugin')
    fakeRepositoryVerifier.observations.set(started.challenge.path, {
      content: `${started.challenge.content}tampered`,
      blobSha: '1'.repeat(40),
      commitSha: '2'.repeat(40),
      observedAt: new Date('2026-08-20T06:01:00.000Z'),
    })

    await expect(
      developerTrust.verifyClaim(completed.session.user.id, started.claim.id),
    ).rejects.toThrow(/does not match/i)
    await expect(
      prisma.pluginOwnership.count({ where: { userId: completed.session.user.id } }),
    ).resolves.toBe(0)
    await expect(
      prisma.badgeGrant.count({
        where: { userId: completed.session.user.id, badge: 'VERIFIED_DEVELOPER', revokedAt: null },
      }),
    ).resolves.toBe(0)
    const claim = await prisma.developerClaim.findUniqueOrThrow({
      where: { id: started.claim.id },
      include: { oauthIdentity: true },
    })
    expect(claim.oauthIdentity.providerUserId).toBe('900003')
    expect(claim.errorCode).toBe('CHALLENGE_MISMATCH')
  })

  it('prevents a different stable GitHub identity from verifying another user claim', async () => {
    const similar = await completeWeb('similar-code')
    const impostor = await completeWeb('impostor-code')
    const claim = await prisma.developerClaim.findFirstOrThrow({
      where: { claimantUserId: similar.session.user.id, pluginId: 'alpha-pagination-plugin' },
      orderBy: { createdAt: 'desc' },
    })

    await expect(
      developerTrust.verifyClaim(impostor.session.user.id, claim.id),
    ).rejects.toThrow(/not found/i)
    await expect(
      prisma.pluginOwnership.count({ where: { userId: impostor.session.user.id } }),
    ).resolves.toBe(0)
  })

  it('rejects a second claimant after a plugin has a verified owner', async () => {
    const impostor = await completeWeb('impostor-code')
    await developerTrust.updateProfile(impostor.session.user.id, {
      displayName: 'Different GitHub ID',
      bio: null,
      website: null,
    })
    await expect(
      developerTrust.startClaim(impostor.session.user.id, snapshot.plugin.id),
    ).rejects.toThrow(/already has a verified owner/i)
  })
})
