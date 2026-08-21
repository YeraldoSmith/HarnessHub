import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'

import type { SourceAggregationAdapter } from '@harnesshub/plugin-sources'
import type { CandidatePluginResponse, DiscoveryRefreshResponse } from '@harnesshub/types'

import { CANDIDATE_PLUGIN_REPOSITORY, type CandidatePluginRepository } from './candidate-plugin.repository.js'

export const SOURCE_AGGREGATION_ADAPTER = Symbol('SOURCE_AGGREGATION_ADAPTER')

@Injectable()
export class DiscoveryService {
  private inFlight: Promise<DiscoveryRefreshResponse> | null = null
  private readonly cooldownMs = 5 * 60_000

  constructor(
    @Inject(CANDIDATE_PLUGIN_REPOSITORY) private readonly repository: CandidatePluginRepository,
    @Inject(SOURCE_AGGREGATION_ADAPTER) private readonly adapter: SourceAggregationAdapter,
  ) {}

  async list(query = '', limit = 100): Promise<CandidatePluginResponse> {
    return this.repository.list(query, limit)
  }

  async refresh(force = false): Promise<DiscoveryRefreshResponse> {
    if (this.inFlight) {
      return { status: 'IN_PROGRESS', discovered: 0, stored: 0, failed: 0, next_refresh_at: null }
    }
    const latest = await this.repository.latestObservedAt()
    const next = latest ? new Date(latest.getTime() + this.cooldownMs) : null
    if (!force && next && next > new Date()) {
      const current = await this.repository.list('', 1)
      return {
        status: 'COOLDOWN',
        discovered: current.total,
        stored: current.total,
        failed: 0,
        next_refresh_at: next.toISOString(),
      }
    }
    this.inFlight = this.performRefresh()
    try { return await this.inFlight } finally { this.inFlight = null }
  }

  private async performRefresh(): Promise<DiscoveryRefreshResponse> {
    try {
      const candidates = await this.adapter.discover()
      const stored = await this.repository.upsertMany(candidates)
      const failed = candidates.filter((candidate) => candidate.last_error).length
      return {
        status: failed > 0 ? 'PARTIAL' : 'SUCCESS',
        discovered: candidates.length,
        stored,
        failed,
        next_refresh_at: new Date(Date.now() + this.cooldownMs).toISOString(),
      }
    } catch {
      throw new ServiceUnavailableException('Public plugin discovery is temporarily unavailable. Existing candidates remain available.')
    }
  }
}
