import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common'

import {
  developerClaimIdSchema,
  developerClaimStartSchema,
  developerProfileUpdateSchema,
} from '@harnesshub/plugin-schema'

import { AuthService } from '../auth/auth.service.js'
import { extractSessionToken } from '../auth/session-token.js'
import { assertTrustedWriteOrigin } from '../auth/write-origin.js'
import { DeveloperTrustService } from './developer-trust.service.js'

@Controller('developer')
export class DeveloperTrustController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DeveloperTrustService) private readonly trust: DeveloperTrustService,
  ) {}

  @Get('me')
  async me(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
  ) {
    return this.trust.summary(await this.userId(authorization, cookie))
  }

  @Put('me')
  async updateMe(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Body() body: unknown,
  ) {
    assertTrustedWriteOrigin(authorization, origin)
    const userId = await this.userId(authorization, cookie)
    const parsed = developerProfileUpdateSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Developer trust request is invalid.')
    const input = parsed.data
    return this.trust.updateProfile(userId, {
      displayName: input.display_name,
      bio: input.bio ?? null,
      website: input.website ?? null,
    })
  }

  @Get('claims')
  async claims(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
  ) {
    return (await this.trust.summary(await this.userId(authorization, cookie))).claims
  }

  @Post('claims')
  async startClaim(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Body() body: unknown,
  ) {
    assertTrustedWriteOrigin(authorization, origin)
    const userId = await this.userId(authorization, cookie)
    const parsed = developerClaimStartSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Developer trust request is invalid.')
    return this.trust.startClaim(userId, parsed.data.plugin_id)
  }

  @Post('claims/:claimId/verify')
  async verifyClaim(
    @Headers('authorization') authorization: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('claimId') claimId: string,
  ) {
    assertTrustedWriteOrigin(authorization, origin)
    const userId = await this.userId(authorization, cookie)
    const parsed = developerClaimIdSchema.safeParse(claimId)
    if (!parsed.success) throw new BadRequestException('Developer trust request is invalid.')
    return this.trust.verifyClaim(userId, parsed.data)
  }

  private async userId(authorization: string | undefined, cookie: string | undefined): Promise<string> {
    const session = await this.auth.session(extractSessionToken(authorization, cookie))
    if (!session.authenticated) throw new UnauthorizedException('Authentication is required.')
    return session.user.id
  }
}
