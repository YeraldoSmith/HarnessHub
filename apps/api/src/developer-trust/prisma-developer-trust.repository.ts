import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import type {
  DeveloperClaim,
  DeveloperProfile,
  DeveloperTrustSummary,
  PluginOwnership,
} from '@harnesshub/types'

import { PrismaService } from '../database/prisma.service.js'
import {
  AssignmentScope,
  DeveloperClaimStatus,
  DeveloperVerificationStatus,
  IdentityBadge,
  IdentityProvider,
  OwnershipType,
  PlatformRole,
  SourceProvider,
  VerificationMethod,
  type DeveloperClaim as PrismaDeveloperClaim,
  type DeveloperProfile as PrismaDeveloperProfile,
  type PluginOwnership as PrismaPluginOwnership,
} from '../generated/prisma/client.js'
import type { GitHubChallengeObservation, GitHubRepositoryIdentity } from './github-repository.verifier.js'

export interface DeveloperProfileInput {
  displayName: string
  bio: string | null
  website: string | null
}

export interface GitHubPluginSource {
  pluginId: string
  repositoryUrl: string
}

export interface StableGitHubIdentity {
  id: string
  providerUserId: string
}

export interface CreateDeveloperClaimInput {
  id: string
  pluginId: string
  claimantUserId: string
  oauthIdentityId: string
  repository: GitHubRepositoryIdentity
  challengeHash: string
  challengePath: string
  challengeExpiresAt: Date
}

export interface ApprovedClaim {
  claim: DeveloperClaim
  ownership: PluginOwnership
}

function profileDto(profile: PrismaDeveloperProfile): DeveloperProfile {
  return {
    id: profile.id,
    user_id: profile.userId,
    display_name: profile.displayName,
    bio: profile.bio,
    website: profile.website,
    verification_status: profile.verificationStatus,
    verified_at: profile.verifiedAt?.toISOString() ?? null,
    created_at: profile.createdAt.toISOString(),
    updated_at: profile.updatedAt.toISOString(),
  }
}

function claimDto(claim: PrismaDeveloperClaim): DeveloperClaim {
  return {
    id: claim.id,
    plugin_id: claim.pluginId,
    status: claim.status,
    repository_url: claim.repositoryUrl,
    source_ref: claim.sourceRef,
    source_external_id: claim.sourceExternalId,
    source_owner_type: claim.sourceOwnerType,
    proof_type: claim.proofType,
    challenge_path: claim.challengePath,
    challenge_expires_at: claim.challengeExpiresAt.toISOString(),
    verified_at: claim.verifiedAt?.toISOString() ?? null,
    error_code: claim.errorCode,
    created_at: claim.createdAt.toISOString(),
  }
}

function ownershipDto(ownership: PrismaPluginOwnership): PluginOwnership {
  return {
    id: ownership.id,
    plugin_id: ownership.pluginId,
    user_id: ownership.userId,
    ownership_type: ownership.ownershipType,
    verification_method: ownership.verificationMethod,
    repository_external_id: ownership.sourceExternalId,
    source_owner_type: ownership.sourceOwnerType,
    verified_at: ownership.verifiedAt.toISOString(),
    revoked_at: ownership.revokedAt?.toISOString() ?? null,
  }
}

@Injectable()
export class PrismaDeveloperTrustRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async upsertProfile(userId: string, input: DeveloperProfileInput): Promise<DeveloperProfile> {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.developerProfile.findUnique({ where: { userId } })
      if (prior?.verificationStatus === DeveloperVerificationStatus.RESTRICTED) {
        throw new ConflictException('Developer profile is restricted.')
      }
      const profile = await tx.developerProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          action: prior ? 'developer_profile.updated' : 'developer_profile.created',
          targetType: 'DeveloperProfile',
          targetId: profile.id,
          metadata: { changed_fields: ['display_name', 'bio', 'website'] },
        },
      })
      return profileDto(profile)
    })
  }

  async summary(userId: string): Promise<DeveloperTrustSummary> {
    const [profile, claims, ownerships] = await Promise.all([
      this.prisma.developerProfile.findUnique({ where: { userId } }),
      this.prisma.developerClaim.findMany({
        where: { claimantUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.pluginOwnership.findMany({
        where: { userId },
        orderBy: { verifiedAt: 'desc' },
      }),
    ])
    return {
      profile: profile ? profileDto(profile) : null,
      claims: claims.map(claimDto),
      ownerships: ownerships.map(ownershipDto),
    }
  }

  async githubPluginSource(pluginId: string): Promise<GitHubPluginSource> {
    const source = await this.prisma.pluginSource.findFirst({
      where: { pluginId, provider: SourceProvider.GITHUB, repositoryUrl: { not: null } },
      select: { pluginId: true, repositoryUrl: true },
    })
    if (!source?.repositoryUrl) throw new NotFoundException('Plugin does not have a claimable GitHub source.')
    return { pluginId: source.pluginId, repositoryUrl: source.repositoryUrl }
  }

  async stableGitHubIdentity(userId: string): Promise<StableGitHubIdentity> {
    const identity = await this.prisma.oAuthIdentity.findFirst({
      where: { userId, provider: IdentityProvider.GITHUB, disabledAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, providerUserId: true },
    })
    if (!identity) throw new NotFoundException('Active GitHub identity is required.')
    return identity
  }

  async createClaim(input: CreateDeveloperClaimInput): Promise<DeveloperClaim> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const profile = await tx.developerProfile.findUnique({ where: { userId: input.claimantUserId } })
        if (!profile) throw new NotFoundException('Create a developer profile before claiming a plugin.')
        if (profile.verificationStatus === DeveloperVerificationStatus.RESTRICTED) {
          throw new ConflictException('Developer profile is restricted.')
        }
        const owner = await tx.pluginOwnership.findFirst({
          where: { pluginId: input.pluginId, ownershipType: OwnershipType.OWNER, revokedAt: null },
        })
        if (owner) throw new ConflictException('Plugin already has a verified owner.')
        const claim = await tx.developerClaim.create({
          data: {
            id: input.id,
            pluginId: input.pluginId,
            claimantUserId: input.claimantUserId,
            oauthIdentityId: input.oauthIdentityId,
            provider: IdentityProvider.GITHUB,
            sourceExternalId: input.repository.externalId,
            sourceOwnerType: input.repository.ownerType,
            sourceOwnerExternalId: input.repository.ownerExternalId,
            repositoryUrl: input.repository.canonicalUrl,
            sourceRef: input.repository.defaultBranch,
            proofType: VerificationMethod.GITHUB_REPOSITORY_CHALLENGE,
            challengeHash: input.challengeHash,
            challengePath: input.challengePath,
            challengeExpiresAt: input.challengeExpiresAt,
          },
        })
        await tx.auditEvent.create({
          data: {
            actorUserId: input.claimantUserId,
            action: 'developer_claim.created',
            targetType: 'DeveloperClaim',
            targetId: claim.id,
            metadata: {
              plugin_id: claim.pluginId,
              provider: 'GITHUB',
              repository_external_id: claim.sourceExternalId,
              oauth_provider_user_id: (await tx.oAuthIdentity.findUniqueOrThrow({ where: { id: input.oauthIdentityId } })).providerUserId,
            },
          },
        })
        return claimDto(claim)
      })
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) throw error
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('An active claim or ownership already exists.')
      }
      throw error
    }
  }

  async beginVerification(userId: string, claimId: string, now: Date): Promise<PrismaDeveloperClaim> {
    const changed = await this.prisma.developerClaim.updateMany({
      where: {
        id: claimId,
        claimantUserId: userId,
        status: DeveloperClaimStatus.PENDING,
        challengeExpiresAt: { gt: now },
      },
      data: { status: DeveloperClaimStatus.VERIFYING, errorCode: null },
    })
    if (changed.count !== 1) {
      const claim = await this.prisma.developerClaim.findUnique({ where: { id: claimId } })
      if (!claim || claim.claimantUserId !== userId) throw new NotFoundException('Developer claim was not found.')
      if (claim.challengeExpiresAt <= now && claim.status === DeveloperClaimStatus.PENDING) {
        await this.prisma.developerClaim.update({
          where: { id: claim.id },
          data: { status: DeveloperClaimStatus.EXPIRED, resolvedAt: now, errorCode: 'CHALLENGE_EXPIRED' },
        })
        throw new ConflictException('Developer claim challenge has expired.')
      }
      throw new ConflictException('Developer claim is not available for verification.')
    }
    return this.prisma.developerClaim.findUniqueOrThrow({ where: { id: claimId } })
  }

  async failVerification(claimId: string, errorCode: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.developerClaim.findUnique({ where: { id: claimId } })
      if (!claim || claim.status !== DeveloperClaimStatus.VERIFYING) return
      const expired = claim.challengeExpiresAt <= new Date()
      await tx.developerClaim.update({
        where: { id: claim.id },
        data: {
          status: expired ? DeveloperClaimStatus.EXPIRED : DeveloperClaimStatus.PENDING,
          resolvedAt: expired ? new Date() : null,
          errorCode: errorCode.slice(0, 80),
        },
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: claim.claimantUserId,
          action: 'developer_claim.verification_failed',
          targetType: 'DeveloperClaim',
          targetId: claim.id,
          metadata: { error_code: errorCode.slice(0, 80) },
        },
      })
    })
  }

  async approveClaim(
    claimId: string,
    observation: GitHubChallengeObservation,
  ): Promise<ApprovedClaim> {
    let result
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.developerClaim.findUniqueOrThrow({ where: { id: claimId } })
      if (claim.status !== DeveloperClaimStatus.VERIFYING) return { conflict: true as const }
      const existingOwner = await tx.pluginOwnership.findFirst({
        where: { pluginId: claim.pluginId, ownershipType: OwnershipType.OWNER, revokedAt: null },
      })
      if (existingOwner) {
        await tx.developerClaim.update({
          where: { id: claim.id },
          data: { status: DeveloperClaimStatus.CONFLICT, resolvedAt: observation.observedAt, errorCode: 'OWNERSHIP_CONFLICT' },
        })
        return { conflict: true as const }
      }
      await tx.verificationEvidence.create({
        data: {
          developerClaimId: claim.id,
          provider: IdentityProvider.GITHUB,
          evidenceType: VerificationMethod.GITHUB_REPOSITORY_CHALLENGE,
          sourceExternalId: claim.sourceExternalId,
          sourceOwnerType: claim.sourceOwnerType,
          sourceOwnerExternalId: claim.sourceOwnerExternalId,
          repositoryUrl: claim.repositoryUrl,
          commitSha: observation.commitSha,
          payload: {
            challenge_path: claim.challengePath,
            source_ref: claim.sourceRef,
            blob_sha: observation.blobSha,
          },
          observedAt: observation.observedAt,
        },
      })
      const ownership = await tx.pluginOwnership.create({
        data: {
          pluginId: claim.pluginId,
          userId: claim.claimantUserId,
          developerClaimId: claim.id,
          ownershipType: OwnershipType.OWNER,
          verificationMethod: VerificationMethod.GITHUB_REPOSITORY_CHALLENGE,
          sourceExternalId: claim.sourceExternalId,
          sourceOwnerType: claim.sourceOwnerType,
          sourceOwnerExternalId: claim.sourceOwnerExternalId,
          verifiedAt: observation.observedAt,
        },
      })
      const approvedClaim = await tx.developerClaim.update({
        where: { id: claim.id },
        data: {
          status: DeveloperClaimStatus.APPROVED,
          verifiedAt: observation.observedAt,
          resolvedAt: observation.observedAt,
          errorCode: null,
        },
      })
      await tx.developerProfile.update({
        where: { userId: claim.claimantUserId },
        data: { verificationStatus: DeveloperVerificationStatus.VERIFIED, verifiedAt: observation.observedAt },
      })
      await tx.roleAssignment.createMany({
        data: [{
          userId: claim.claimantUserId,
          role: PlatformRole.DEVELOPER,
          scopeType: AssignmentScope.PLATFORM,
          reason: 'Verified plugin ownership in Phase 2-C',
        }],
        skipDuplicates: true,
      })
      await tx.badgeGrant.createMany({
        data: [{
          userId: claim.claimantUserId,
          badge: IdentityBadge.VERIFIED_DEVELOPER,
          evidenceType: 'VERIFIED_PLUGIN_OWNERSHIP',
          evidenceRef: `claim:${claim.id}`,
        }],
        skipDuplicates: true,
      })
      await tx.auditEvent.createMany({
        data: [
          {
            actorUserId: claim.claimantUserId,
            action: 'developer_claim.approved',
            targetType: 'DeveloperClaim',
            targetId: claim.id,
            metadata: { plugin_id: claim.pluginId, repository_external_id: claim.sourceExternalId },
          },
          {
            actorUserId: claim.claimantUserId,
            action: 'plugin_ownership.granted',
            targetType: 'PluginOwnership',
            targetId: ownership.id,
            metadata: { plugin_id: claim.pluginId, ownership_type: 'OWNER' },
          },
        ],
      })
        return { conflict: false as const, claim: approvedClaim, ownership }
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && (error.code === 'P2002' || error.code === 'P2034')) {
        throw new ConflictException('Plugin already has a verified owner.')
      }
      throw error
    }
    if (result.conflict) throw new ConflictException('Plugin already has a verified owner.')
    return { claim: claimDto(result.claim), ownership: ownershipDto(result.ownership) }
  }
}
