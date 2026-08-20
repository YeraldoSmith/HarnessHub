import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import { pluginIdSchema } from '@harnesshub/plugin-schema'
import type { SyncJobRecord } from '@harnesshub/types'

import { PrismaSyncJobRepository } from './prisma-sync-job.repository.js'

@Injectable()
export class SyncJobService {
  constructor(@Inject(PrismaSyncJobRepository) private readonly jobs: PrismaSyncJobRepository) {}

  async list(pluginId?: string): Promise<SyncJobRecord[]> {
    if (pluginId && !pluginIdSchema.safeParse(pluginId).success) {
      throw new BadRequestException('Invalid plugin ID.')
    }
    return this.jobs.list(pluginId)
  }
}
