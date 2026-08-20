import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module.js'
import { DeveloperTrustConfig } from './developer-trust.config.js'
import { DeveloperTrustController } from './developer-trust.controller.js'
import { DeveloperTrustService } from './developer-trust.service.js'
import {
  GITHUB_REPOSITORY_VERIFIER,
  PublicGitHubRepositoryVerifier,
} from './github-repository.verifier.js'
import { PrismaDeveloperTrustRepository } from './prisma-developer-trust.repository.js'

@Module({
  imports: [AuthModule],
  controllers: [DeveloperTrustController],
  providers: [
    DeveloperTrustConfig,
    PrismaDeveloperTrustRepository,
    PublicGitHubRepositoryVerifier,
    { provide: GITHUB_REPOSITORY_VERIFIER, useExisting: PublicGitHubRepositoryVerifier },
    DeveloperTrustService,
  ],
})
export class DeveloperTrustModule {}
