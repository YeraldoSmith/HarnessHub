import { Module } from '@nestjs/common'

import { PrismaService } from '../database/prisma.service.js'
import { PluginService } from './plugin.service.js'
import { PLUGIN_REPOSITORY } from './plugin.repository.js'
import { PrismaPluginRepository } from './prisma-plugin.repository.js'
import { RegistryController } from './registry.controller.js'

@Module({
  controllers: [RegistryController],
  providers: [
    PrismaService,
    PrismaPluginRepository,
    {
      provide: PLUGIN_REPOSITORY,
      useExisting: PrismaPluginRepository,
    },
    PluginService,
  ],
})
export class RegistryModule {}
