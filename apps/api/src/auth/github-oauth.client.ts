import { BadGatewayException, Inject, Injectable } from '@nestjs/common'

import { AuthConfig } from './auth.config.js'

export interface GitHubIdentity {
  providerUserId: string
  login: string
  avatarUrl: string | null
  profileUrl: string | null
}

export interface GitHubOAuthGateway {
  authorizationUrl(state: string, challenge: string): string
  authenticate(code: string, verifier: string): Promise<GitHubIdentity>
}

export const GITHUB_OAUTH_GATEWAY = Symbol('GITHUB_OAUTH_GATEWAY')

function optionalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

@Injectable()
export class GitHubOAuthClient implements GitHubOAuthGateway {
  constructor(@Inject(AuthConfig) private readonly config: AuthConfig) {}

  authorizationUrl(state: string, challenge: string): string {
    const config = this.config.github()
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('redirect_uri', config.callbackUrl)
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  }

  async authenticate(code: string, verifier: string): Promise<GitHubIdentity> {
    const config = this.config.github()
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'HarnessHub',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!tokenResponse.ok) throw new BadGatewayException('GitHub authentication failed.')
    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>
    const accessToken = tokenPayload.access_token
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new BadGatewayException('GitHub authentication failed.')
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'HarnessHub',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!userResponse.ok) throw new BadGatewayException('GitHub identity lookup failed.')
    const user = (await userResponse.json()) as Record<string, unknown>
    if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0 || typeof user.login !== 'string') {
      throw new BadGatewayException('GitHub returned an invalid identity.')
    }

    return {
      providerUserId: String(user.id),
      login: user.login,
      avatarUrl: optionalUrl(user.avatar_url),
      profileUrl: optionalUrl(user.html_url),
    }
  }
}
