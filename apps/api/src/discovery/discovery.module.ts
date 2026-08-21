import { Module } from '@nestjs/common'

import { CommunityCatalogAdapter, GitHubDiscoveryAdapter, type PublicSourceCandidate } from '@harnesshub/plugin-sources'

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
        const catalog = new CommunityCatalogAdapter({
          maxEntries: positiveInteger(process.env.COMMUNITY_CATALOG_LIMIT, 200),
        })
        const github = new GitHubDiscoveryAdapter({
          token,
          perQuery: positiveInteger(process.env.DISCOVERY_RESULTS_PER_QUERY, 100),
          detailLimit: process.env.DISCOVERY_DETAIL_LIMIT
            ? positiveInteger(process.env.DISCOVERY_DETAIL_LIMIT, token ? 1_000 : 12)
            : undefined,
          pagesPerQuery: positiveInteger(process.env.DISCOVERY_PAGES_PER_QUERY, token ? 10 : 1),
          retries: 2,
        })
        return {
          discover: async (): Promise<PublicSourceCandidate[]> => {
            const [catalogCandidates, githubCandidates] = await Promise.all([
              catalog.discover(),
              github.discover().catch(() => []),
            ])
            // The direct GitHub scan has stronger npm SHA-512 evidence when it
            // overlaps a catalog entry, so it intentionally wins the merge.
            const merged = new Map<string, PublicSourceCandidate>()
            for (const candidate of [...catalogCandidates, ...githubCandidates]) {
              merged.set(`${candidate.repository.toLowerCase()}#${candidate.bundle_directory ?? ''}`, candidate)
            }
            return [...merged.values()]
          },
        }
      },
    },
  ],
})
export class DiscoveryModule {}
