import { BadRequestException, Controller, Get, Inject, Post, Query } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'

import { DiscoveryService } from './discovery.service.js'

@Controller('discovery')
export class DiscoveryController {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  @Get('candidates')
  list(@Query('q') query = '', @Query('limit') rawLimit = '100') {
    const limit = Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || query.length > 100) {
      throw new BadRequestException('Invalid discovery query.')
    }
    return this.discovery.list(query, limit)
  }

  @Post('refresh')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  refresh() {
    return this.discovery.refresh()
  }
}
