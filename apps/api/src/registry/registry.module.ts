import { Module } from '@nestjs/common'

import { PluginService } from './plugin.service.js'
import { PLUGIN_REPOSITORY } from './plugin.repository.js'
import { PrismaPluginRepository } from './prisma-plugin.repository.js'
import { RegistryController } from './registry.controller.js'
import { PrismaSyncJobRepository } from '../sync/prisma-sync-job.repository.js'
import { SyncJobController } from '../sync/sync-job.controller.js'
import { SyncJobService } from '../sync/sync-job.service.js'

@Module({
  controllers: [RegistryController, SyncJobController],
  providers: [
    PrismaSyncJobRepository,
    SyncJobService,
    PrismaPluginRepository,
    {
      provide: PLUGIN_REPOSITORY,
      useExisting: PrismaPluginRepository,
    },
    PluginService,
  ],
})
export class RegistryModule {}
