import { Controller, Get, Inject, Query } from '@nestjs/common'

import { SyncJobService } from './sync-job.service.js'

@Controller('sync-jobs')
export class SyncJobController {
  constructor(@Inject(SyncJobService) private readonly syncJobs: SyncJobService) {}

  @Get()
  list(@Query('pluginId') pluginId?: string) {
    return this.syncJobs.list(pluginId)
  }
}
