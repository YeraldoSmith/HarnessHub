import { Module } from '@nestjs/common'

import { HealthController } from './health.controller.js'
import { RegistryModule } from './registry/registry.module.js'

@Module({
  imports: [RegistryModule],
  controllers: [HealthController],
})
export class AppModule {}
