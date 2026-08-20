import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'

import type { AuthSessionResponse, AuthUser } from '@harnesshub/types'

import { PrismaService } from '../database/prisma.service.js'
import {
  AssignmentScope,
  IdentityProvider,
  OAuthClient,
  OAuthTransactionStatus,
  PlatformRole,
  UserStatus,
  type OAuthTransaction,
} from '../generated/prisma/client.js'
import type { GitHubIdentity } from './github-oauth.client.js'

interface CreateOAuthTransactionInput {
  stateHash: string
  codeVerifierCiphertext: string
  client: OAuthClient
  desktopPollTokenHash?: string
  expiresAt: Date
}

interface CreatedSession {
  id: string
  expiresAt: Date
}

interface DesktopDelivery {
  status: 'PENDING' | 'COMPLETE'
  ciphertext?: string
}

const roleOrder: Record<string, number> = {
  FOUNDER: 0,
  ADMIN: 1,
  MODERATOR: 2,
  REVIEWER: 3,
  DEVELOPER: 4,
  USER: 5,
}

@Injectable()
export class PrismaAuthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  createOAuthTransaction(input: CreateOAuthTransactionInput): Promise<OAuthTransaction> {
    return this.prisma.oAuthTransaction.create({ data: input })
  }

  async claimOAuthTransaction(stateHash: string, now: Date): Promise<OAuthTransaction | null> {
    const claimed = await this.prisma.oAuthTransaction.updateMany({
      where: {
        stateHash,
        status: OAuthTransactionStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: { status: OAuthTransactionStatus.PROCESSING, consumedAt: now },
    })
    if (claimed.count !== 1) return null
    return this.prisma.oAuthTransaction.findUnique({ where: { stateHash } })
  }

  async completeOAuthTransaction(id: string, desktopSessionCiphertext?: string): Promise<void> {
    await this.prisma.oAuthTransaction.update({
      where: { id },
      data: {
        status: OAuthTransactionStatus.COMPLETED,
        codeVerifierCiphertext: null,
        desktopSessionCiphertext: desktopSessionCiphertext ?? null,
        completedAt: new Date(),
        errorCode: null,
      },
    })
  }

  async failOAuthTransaction(id: string, errorCode: string): Promise<void> {
    await this.prisma.oAuthTransaction.updateMany({
      where: { id, status: { in: [OAuthTransactionStatus.PENDING, OAuthTransactionStatus.PROCESSING] } },
      data: {
        status: OAuthTransactionStatus.FAILED,
        codeVerifierCiphertext: null,
        desktopSessionCiphertext: null,
        errorCode: errorCode.slice(0, 80),
        completedAt: new Date(),
      },
    })
  }

  async resolveGitHubIdentity(identity: GitHubIdentity): Promise<AuthUser> {
    const where = {
      provider_issuer_providerUserId: {
        provider: IdentityProvider.GITHUB,
        issuer: 'https://github.com',
        providerUserId: identity.providerUserId,
      },
    } as const
    const metadata = {
      login: identity.login,
      avatar_url: identity.avatarUrl,
      profile_url: identity.profileUrl,
      observed_at: new Date().toISOString(),
    }

    let record = await this.prisma.oAuthIdentity.findUnique({ where })
    if (record?.disabledAt) throw new UnauthorizedException('This identity is disabled.')

    if (record) {
      record = await this.prisma.oAuthIdentity.update({
        where: { id: record.id },
        data: { metadata, lastAuthenticatedAt: new Date() },
      })
    } else {
      try {
        record = await this.prisma.oAuthIdentity.create({
          data: {
            provider: IdentityProvider.GITHUB,
            issuer: 'https://github.com',
            providerUserId: identity.providerUserId,
            metadata,
            lastAuthenticatedAt: new Date(),
            user: {
              create: {
                roleAssignments: {
                  create: {
                    role: PlatformRole.USER,
                    scopeType: AssignmentScope.PLATFORM,
                    reason: 'GitHub OAuth account creation',
                  },
                },
              },
            },
          },
        })
      } catch (error) {
        record = await this.prisma.oAuthIdentity.findUnique({ where })
        if (!record) throw error
      }
    }

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: record.userId,
        action: 'identity.github_authenticated',
        targetType: 'OAuthIdentity',
        targetId: record.id,
        metadata: { provider: 'GITHUB', provider_user_id: identity.providerUserId },
      },
    })
    return this.getUser(record.userId)
  }

  async createSession(
    userId: string,
    tokenHash: string,
    client: OAuthClient,
    expiresAt: Date,
  ): Promise<CreatedSession> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.authSession.create({
        data: { userId, tokenHash, client, expiresAt },
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          action: 'session.created',
          targetType: 'AuthSession',
          targetId: session.id,
          metadata: { client },
        },
      })
      return { id: session.id, expiresAt: session.expiresAt }
    })
  }

  async getSession(tokenHash: string): Promise<AuthSessionResponse> {
    const now = new Date()
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash } })
    if (!session || session.revokedAt || session.expiresAt <= now) return { authenticated: false }
    const user = await this.getUser(session.userId)
    if (user.status !== UserStatus.ACTIVE) return { authenticated: false }
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    })
    return { authenticated: true, user, expires_at: session.expiresAt.toISOString() }
  }

  async revokeSession(tokenHash: string): Promise<void> {
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash } })
    if (!session || session.revokedAt) return
    await this.prisma.$transaction([
      this.prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
      this.prisma.auditEvent.create({
        data: {
          actorUserId: session.userId,
          action: 'session.revoked',
          targetType: 'AuthSession',
          targetId: session.id,
          metadata: { client: session.client },
        },
      }),
    ])
  }

  async exchangeDesktopSession(
    transactionId: string,
    pollTokenHash: string,
    now: Date,
  ): Promise<DesktopDelivery> {
    const transaction = await this.prisma.oAuthTransaction.findUnique({ where: { id: transactionId } })
    if (!transaction || transaction.desktopPollTokenHash !== pollTokenHash) {
      throw new UnauthorizedException('Invalid desktop login request.')
    }
    if (transaction.expiresAt <= now || transaction.status === OAuthTransactionStatus.FAILED) {
      throw new UnauthorizedException('Desktop login request expired or failed.')
    }
    if (transaction.status !== OAuthTransactionStatus.COMPLETED) return { status: 'PENDING' }
    if (!transaction.desktopSessionCiphertext || transaction.deliveredAt) {
      throw new UnauthorizedException('Desktop login session was already delivered.')
    }
    const delivered = await this.prisma.oAuthTransaction.updateMany({
      where: { id: transaction.id, deliveredAt: null, desktopSessionCiphertext: { not: null } },
      data: { deliveredAt: now, desktopSessionCiphertext: null },
    })
    if (delivered.count !== 1) throw new UnauthorizedException('Desktop login session was already delivered.')
    return { status: 'COMPLETE', ciphertext: transaction.desktopSessionCiphertext }
  }

  async getUser(userId: string): Promise<AuthUser> {
    const now = new Date()
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        identities: {
          where: { provider: IdentityProvider.GITHUB, disabledAt: null },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        roleAssignments: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
        badgeGrants: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
    })
    const identity = user.identities[0]
    if (!identity) throw new UnauthorizedException('GitHub identity is unavailable.')
    const metadata = identity.metadata as Record<string, unknown>
    return {
      id: user.id,
      status: user.status,
      github: {
        user_id: identity.providerUserId,
        login: typeof metadata.login === 'string' ? metadata.login : null,
        avatar_url: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
      },
      roles: user.roleAssignments
        .map((assignment) => assignment.role)
        .sort((left, right) => (roleOrder[left] ?? 99) - (roleOrder[right] ?? 99)),
      badges: user.badgeGrants.map((grant) => grant.badge).sort(),
    }
  }
}
