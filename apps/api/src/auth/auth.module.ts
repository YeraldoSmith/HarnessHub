import { Module } from '@nestjs/common'

import { AuthConfig } from './auth.config.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { GITHUB_OAUTH_GATEWAY, GitHubOAuthClient } from './github-oauth.client.js'
import { PrismaAuthRepository } from './prisma-auth.repository.js'

@Module({
  controllers: [AuthController],
  providers: [
    AuthConfig,
    PrismaAuthRepository,
    GitHubOAuthClient,
    { provide: GITHUB_OAUTH_GATEWAY, useExisting: GitHubOAuthClient },
    AuthService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
