import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export interface GitHubOAuthConfig {
  clientId: string
  clientSecret: string
  callbackUrl: string
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) {
    throw new ServiceUnavailableException(`${name} must be a positive integer.`)
  }
  return value
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new ServiceUnavailableException('GitHub OAuth is not configured.')
  return value
}

@Injectable()
export class AuthConfig {
  github(): GitHubOAuthConfig {
    const callbackUrl = required('GITHUB_CALLBACK_URL')
    this.assertCallbackUrl(callbackUrl)
    return {
      clientId: required('GITHUB_CLIENT_ID'),
      clientSecret: required('GITHUB_CLIENT_SECRET'),
      callbackUrl,
    }
  }

  sessionSecret(): string {
    const secret = required('SESSION_SECRET')
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new ServiceUnavailableException('SESSION_SECRET must contain at least 32 bytes.')
    }
    return secret
  }

  webSuccessUrl(): string {
    const value = process.env.AUTH_WEB_SUCCESS_URL?.trim() ?? 'http://127.0.0.1:5173/?auth=success'
    const url = new URL(value)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && this.isLoopback(url.hostname))) {
      throw new ServiceUnavailableException('AUTH_WEB_SUCCESS_URL must use HTTPS or a loopback HTTP URL.')
    }
    return url.toString()
  }

  oauthTransactionTtlMs(): number {
    return positiveInteger('OAUTH_TRANSACTION_TTL_SECONDS', 600) * 1_000
  }

  sessionTtlMs(): number {
    return positiveInteger('SESSION_TTL_SECONDS', 604_800) * 1_000
  }

  secureCookie(): boolean {
    return new URL(this.github().callbackUrl).protocol === 'https:'
  }

  private assertCallbackUrl(value: string): void {
    const url = new URL(value)
    if (url.pathname !== '/auth/github/callback' || url.search || url.hash) {
      throw new ServiceUnavailableException('GITHUB_CALLBACK_URL must end with /auth/github/callback.')
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && this.isLoopback(url.hostname))) {
      throw new ServiceUnavailableException('GITHUB_CALLBACK_URL must use HTTPS or a loopback HTTP URL.')
    }
  }

  private isLoopback(hostname: string): boolean {
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
  }
}
