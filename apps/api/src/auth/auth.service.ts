import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'

import type {
  AuthSessionResponse,
  DesktopOAuthStartResponse,
  DesktopSessionExchangeResponse,
} from '@harnesshub/types'

import { OAuthClient, UserStatus } from '../generated/prisma/client.js'
import { AuthConfig } from './auth.config.js'
import {
  decryptSecret,
  encryptSecret,
  pkceChallenge,
  randomToken,
  sha256,
} from './auth.crypto.js'
import {
  GITHUB_OAUTH_GATEWAY,
  type GitHubOAuthGateway,
} from './github-oauth.client.js'
import { PrismaAuthRepository } from './prisma-auth.repository.js'

interface OAuthCompletion {
  client: OAuthClient
  sessionToken: string
  session: Extract<AuthSessionResponse, { authenticated: true }>
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthConfig) private readonly config: AuthConfig,
    @Inject(PrismaAuthRepository) private readonly repository: PrismaAuthRepository,
    @Inject(GITHUB_OAUTH_GATEWAY) private readonly github: GitHubOAuthGateway,
  ) {}

  async startWeb(): Promise<string> {
    return (await this.start(OAuthClient.WEB)).authorizationUrl
  }

  async startDesktop(): Promise<DesktopOAuthStartResponse> {
    const started = await this.start(OAuthClient.DESKTOP)
    if (!started.pollToken) throw new Error('Desktop OAuth transaction did not include a poll token.')
    return {
      authorization_url: started.authorizationUrl,
      transaction_id: started.transactionId,
      poll_token: started.pollToken,
      expires_at: started.expiresAt.toISOString(),
    }
  }

  async complete(code: string | undefined, state: string | undefined): Promise<OAuthCompletion> {
    if (!code || !/^[A-Za-z0-9_-]{8,512}$/.test(code)) {
      throw new BadRequestException('Invalid OAuth authorization code.')
    }
    if (!state || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) {
      throw new BadRequestException('Invalid OAuth state.')
    }

    const transaction = await this.repository.claimOAuthTransaction(sha256(state), new Date())
    if (!transaction || !transaction.codeVerifierCiphertext) {
      throw new UnauthorizedException('OAuth transaction is invalid, expired, or already used.')
    }

    let sessionTokenHash: string | null = null
    try {
      const verifier = decryptSecret(
        transaction.codeVerifierCiphertext,
        this.config.sessionSecret(),
        `oauth-verifier:${transaction.stateHash}`,
      )
      const githubIdentity = await this.github.authenticate(code, verifier)
      const user = await this.repository.resolveGitHubIdentity(githubIdentity)
      if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('User account is not active.')

      const sessionToken = randomToken(48)
      sessionTokenHash = sha256(sessionToken)
      const expiresAt = new Date(Date.now() + this.config.sessionTtlMs())
      await this.repository.createSession(user.id, sessionTokenHash, transaction.client, expiresAt)
      const session = { authenticated: true as const, user, expires_at: expiresAt.toISOString() }

      const desktopCiphertext =
        transaction.client === OAuthClient.DESKTOP
          ? encryptSecret(
              sessionToken,
              this.config.sessionSecret(),
              `desktop-session:${transaction.id}`,
            )
          : undefined
      await this.repository.completeOAuthTransaction(transaction.id, desktopCiphertext)
      return { client: transaction.client, sessionToken, session }
    } catch (error) {
      if (sessionTokenHash) await this.repository.revokeSession(sessionTokenHash)
      await this.repository.failOAuthTransaction(transaction.id, this.errorCode(error))
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof BadGatewayException
      ) {
        throw error
      }
      throw new BadGatewayException('GitHub authentication could not be completed.')
    }
  }

  async exchangeDesktop(
    transactionId: string,
    pollToken: string,
  ): Promise<DesktopSessionExchangeResponse> {
    if (!/^[0-9a-f-]{36}$/.test(transactionId) || !/^[A-Za-z0-9_-]{32,128}$/.test(pollToken)) {
      throw new UnauthorizedException('Invalid desktop login request.')
    }
    const delivery = await this.repository.exchangeDesktopSession(
      transactionId,
      sha256(pollToken),
      new Date(),
    )
    if (delivery.status === 'PENDING') return { status: 'PENDING' }
    if (!delivery.ciphertext) throw new UnauthorizedException('Desktop login session is unavailable.')
    const sessionToken = decryptSecret(
      delivery.ciphertext,
      this.config.sessionSecret(),
      `desktop-session:${transactionId}`,
    )
    const session = await this.repository.getSession(sha256(sessionToken))
    if (!session.authenticated) throw new UnauthorizedException('Desktop login session is unavailable.')
    return { status: 'COMPLETE', session_token: sessionToken, session }
  }

  session(sessionToken: string | null): Promise<AuthSessionResponse> {
    if (!sessionToken) return Promise.resolve({ authenticated: false })
    return this.repository.getSession(sha256(sessionToken))
  }

  async logout(sessionToken: string | null): Promise<void> {
    if (sessionToken) await this.repository.revokeSession(sha256(sessionToken))
  }

  cookieOptions(expiresAt: string) {
    return {
      httpOnly: true,
      secure: this.config.secureCookie(),
      sameSite: 'lax' as const,
      path: '/',
      expires: new Date(expiresAt),
    }
  }

  webSuccessUrl(): string {
    return this.config.webSuccessUrl()
  }

  private async start(client: OAuthClient): Promise<{
    authorizationUrl: string
    transactionId: string
    pollToken?: string
    expiresAt: Date
  }> {
    const state = randomToken(32)
    const verifier = randomToken(48)
    const stateHash = sha256(state)
    const pollToken = client === OAuthClient.DESKTOP ? randomToken(32) : undefined
    const expiresAt = new Date(Date.now() + this.config.oauthTransactionTtlMs())
    const transaction = await this.repository.createOAuthTransaction({
      stateHash,
      codeVerifierCiphertext: encryptSecret(
        verifier,
        this.config.sessionSecret(),
        `oauth-verifier:${stateHash}`,
      ),
      client,
      desktopPollTokenHash: pollToken ? sha256(pollToken) : undefined,
      expiresAt,
    })
    return {
      authorizationUrl: this.github.authorizationUrl(state, pkceChallenge(verifier)),
      transactionId: transaction.id,
      pollToken,
      expiresAt,
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof UnauthorizedException) return 'UNAUTHORIZED'
    if (error instanceof BadRequestException) return 'INVALID_CALLBACK'
    if (error instanceof BadGatewayException) return 'GITHUB_FAILURE'
    return 'INTERNAL_FAILURE'
  }
}
