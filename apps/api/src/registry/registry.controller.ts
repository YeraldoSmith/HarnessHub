import { Controller, Get, Inject, Param, Query } from '@nestjs/common'

import { PluginService } from './plugin.service.js'

@Controller('plugins')
export class RegistryController {
  constructor(@Inject(PluginService) private readonly pluginService: PluginService) {}

  @Get()
  list(@Query('q') query?: string) {
    return this.pluginService.list(query)
  }

  @Get(':id/snapshots/compare')
  compareSnapshots(
    @Param('id') id: string,
    @Query('from') fromSnapshotId?: string,
    @Query('to') toSnapshotId?: string,
  ) {
    return this.pluginService.compareSnapshots(id, fromSnapshotId, toSnapshotId)
  }

  @Get(':id/snapshots')
  listSnapshots(@Param('id') id: string) {
    return this.pluginService.listSnapshots(id)
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.pluginService.getById(id)
  }
}
