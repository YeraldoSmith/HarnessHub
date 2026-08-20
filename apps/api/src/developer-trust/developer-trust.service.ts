import { randomUUID, timingSafeEqual } from 'node:crypto'

import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import type {
  DeveloperClaimStartResponse,
  DeveloperClaimVerificationResponse,
  DeveloperProfile,
  DeveloperTrustSummary,
} from '@harnesshub/types'

import { randomToken, sha256 } from '../auth/auth.crypto.js'
import { DeveloperTrustConfig } from './developer-trust.config.js'
import {
  GITHUB_REPOSITORY_VERIFIER,
  GitHubVerificationError,
  type GitHubRepositoryIdentity,
  type GitHubRepositoryVerifier,
} from './github-repository.verifier.js'
import {
  PrismaDeveloperTrustRepository,
  type DeveloperProfileInput,
} from './prisma-developer-trust.repository.js'

@Injectable()
export class DeveloperTrustService {
  constructor(
    @Inject(DeveloperTrustConfig) private readonly config: DeveloperTrustConfig,
    @Inject(PrismaDeveloperTrustRepository) private readonly repository: PrismaDeveloperTrustRepository,
    @Inject(GITHUB_REPOSITORY_VERIFIER) private readonly github: GitHubRepositoryVerifier,
  ) {}

  updateProfile(userId: string, input: DeveloperProfileInput): Promise<DeveloperProfile> {
    return this.repository.upsertProfile(userId, input)
  }

  summary(userId: string): Promise<DeveloperTrustSummary> {
    return this.repository.summary(userId)
  }

  async startClaim(userId: string, pluginId: string): Promise<DeveloperClaimStartResponse> {
    const source = await this.repository.githubPluginSource(pluginId)
    const identity = await this.repository.stableGitHubIdentity(userId)
    let repository: GitHubRepositoryIdentity
    try {
      repository = await this.github.describe(source.repositoryUrl)
    } catch (error) {
      throw this.githubException(error)
    }
    if (repository.private) throw new BadRequestException('Private repositories are not supported in this phase.')
    if (repository.archived) throw new ConflictException('Archived repositories cannot be claimed.')

    const id = randomUUID()
    const nonce = randomToken(32)
    const content = `harnesshub-developer-claim-v1\nclaim_id=${id}\nnonce=${nonce}\n`
    const path = `.harnesshub/claims/${id}.txt`
    const expiresAt = new Date(Date.now() + this.config.claimTtlMs())
    const claim = await this.repository.createClaim({
      id,
      pluginId,
      claimantUserId: userId,
      oauthIdentityId: identity.id,
      repository,
      challengeHash: sha256(content),
      challengePath: path,
      challengeExpiresAt: expiresAt,
    })
    return {
      claim,
      challenge: {
        path,
        content,
        expires_at: expiresAt.toISOString(),
        instructions: `Commit this exact file at ${path} to the repository default branch, then request verification.`,
      },
    }
  }

  async verifyClaim(userId: string, claimId: string): Promise<DeveloperClaimVerificationResponse> {
    const claim = await this.repository.beginVerification(userId, claimId, new Date())
    try {
      const current = await this.github.describe(claim.repositoryUrl)
      if (
        current.private ||
        current.archived ||
        current.externalId !== claim.sourceExternalId ||
        current.ownerType !== claim.sourceOwnerType ||
        current.ownerExternalId !== claim.sourceOwnerExternalId ||
        current.defaultBranch !== claim.sourceRef
      ) {
        throw new ForbiddenException('Repository identity no longer matches the claim evidence.')
      }
      const observation = await this.github.observe(current, claim.challengePath, claim.sourceRef)
      const actual = Buffer.from(sha256(observation.content), 'hex')
      const expected = Buffer.from(claim.challengeHash, 'hex')
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new ForbiddenException('Repository challenge content does not match this claim.')
      }
      const approved = await this.repository.approveClaim(claim.id, observation)
      return { ...approved, badge: 'VERIFIED_DEVELOPER' }
    } catch (error) {
      const safeCode = this.errorCode(error)
      await this.repository.failVerification(claim.id, safeCode)
      if (error instanceof ForbiddenException || error instanceof ConflictException) throw error
      throw this.githubException(error)
    }
  }

  private githubException(error: unknown): Error {
    if (error instanceof GitHubVerificationError) {
      if (error.code === 'INVALID_REPOSITORY_URL') return new BadRequestException('Plugin source is not a valid GitHub repository URL.')
      if (error.code === 'REPOSITORY_NOT_FOUND') return new NotFoundException('GitHub repository is unavailable.')
      if (error.code === 'CHALLENGE_NOT_FOUND') return new NotFoundException('Repository challenge file was not found.')
      return new BadGatewayException('GitHub verification is temporarily unavailable.')
    }
    if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof BadGatewayException) {
      return error
    }
    return new BadGatewayException('GitHub verification could not be completed.')
  }

  private errorCode(error: unknown): string {
    if (error instanceof GitHubVerificationError) return error.code
    if (error instanceof ForbiddenException) return 'CHALLENGE_MISMATCH'
    if (error instanceof ConflictException) return 'OWNERSHIP_CONFLICT'
    return 'VERIFICATION_FAILURE'
  }
}
