import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'

import { DiscoveryService } from './discovery.service.js'

@Injectable()
export class DiscoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    const minutes = Number(process.env.DISCOVERY_SYNC_INTERVAL_MINUTES ?? 0)
    if (!Number.isFinite(minutes) || minutes < 5) return
    this.timer = setInterval(() => {
      void this.discovery.refresh().catch(() => undefined)
    }, minutes * 60_000)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }
}
