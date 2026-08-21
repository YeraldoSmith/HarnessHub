import { Module } from '@nestjs/common'

import { GitHubDiscoveryAdapter } from '@harnesshub/plugin-sources'

import { CANDIDATE_PLUGIN_REPOSITORY } from './candidate-plugin.repository.js'
import { DiscoveryController } from './discovery.controller.js'
import { DiscoveryScheduler } from './discovery.scheduler.js'
import { DiscoveryService, SOURCE_AGGREGATION_ADAPTER } from './discovery.service.js'
import { PrismaCandidatePluginRepository } from './prisma-candidate-plugin.repository.js'

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

@Module({
  controllers: [DiscoveryController],
  providers: [
    PrismaCandidatePluginRepository,
    DiscoveryService,
    DiscoveryScheduler,
    { provide: CANDIDATE_PLUGIN_REPOSITORY, useExisting: PrismaCandidatePluginRepository },
    {
      provide: SOURCE_AGGREGATION_ADAPTER,
      useFactory: () => {
        const token = process.env.GITHUB_DISCOVERY_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || undefined
        return new GitHubDiscoveryAdapter({
          token,
          perQuery: positiveInteger(process.env.DISCOVERY_RESULTS_PER_QUERY, 30),
          detailLimit: process.env.DISCOVERY_DETAIL_LIMIT
            ? positiveInteger(process.env.DISCOVERY_DETAIL_LIMIT, token ? 30 : 12)
            : undefined,
          retries: 2,
        })
      },
    },
  ],
})
export class DiscoveryModule {}
