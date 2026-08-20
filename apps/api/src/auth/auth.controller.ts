import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'

import { AuthService } from './auth.service.js'

const sessionCookie = 'hh_session'

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const pair of header.split(';')) {
    const [key, ...value] = pair.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

function sessionToken(authorization: string | undefined, cookie: string | undefined): string | null {
  if (authorization?.startsWith('Bearer ')) {
    const value = authorization.slice('Bearer '.length).trim()
    if (/^[A-Za-z0-9_-]{32,128}$/.test(value)) return value
  }
  const value = cookieValue(cookie, sessionCookie)
  return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null
}

function callbackPage(success: boolean): string {
  const title = success ? 'HarnessHub login complete' : 'HarnessHub login failed'
  const message = success
    ? 'Your desktop session is ready. You can close this window and return to HarnessHub.'
    : 'The GitHub login could not be completed. Close this window and try again from HarnessHub.'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#f4f7f2;color:#10241b;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.card{max-width:520px;margin:24px;padding:40px;border:1px solid #d7dfd8;border-radius:28px;background:white;box-shadow:0 24px 70px #17332318}h1{margin:0 0 12px;font-size:32px}p{line-height:1.6;color:#536159}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p></main></body></html>`
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get('github')
  async startGitHub(@Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store')
    response.redirect(302, await this.auth.startWeb())
  }

  @Post('github/desktop/start')
  startDesktop() {
    return this.auth.startDesktop()
  }

  @Get('github/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    )
    try {
      const completed = await this.auth.complete(code, state)
      if (completed.client === 'WEB') {
        response.cookie(sessionCookie, completed.sessionToken, this.auth.cookieOptions(completed.session.expires_at))
        response.redirect(302, this.auth.webSuccessUrl())
        return
      }
      response.status(200).type('html').send(callbackPage(true))
    } catch {
      response.status(400).type('html').send(callbackPage(false))
    }
  }

  @Post('github/desktop/exchange')
  @HttpCode(200)
  exchangeDesktop(@Body() body: { transaction_id?: string; poll_token?: string }) {
    return this.auth.exchangeDesktop(body.transaction_id ?? '', body.poll_token ?? '')
  }

  @Get('session')
  getSession(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
  ) {
    return this.auth.session(sessionToken(authorization, cookie))
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await this.auth.logout(sessionToken(authorization, cookie))
    response.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', path: '/' })
    response.status(204).send()
  }
}
