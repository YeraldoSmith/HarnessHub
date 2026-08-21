import { describe, expect, it } from 'vitest'

import type { PublicSourceCandidate, SourceAggregationAdapter } from '@harnesshub/plugin-sources'

import type { CandidatePluginRepository } from './candidate-plugin.repository.js'
import { DiscoveryService } from './discovery.service.js'

const candidate: PublicSourceCandidate = {
  provider: 'github',
  external_id: '501',
  repository: 'Example/DSH-Plugin',
  repository_url: 'https://github.com/Example/DSH-Plugin',
  author: 'Example',
  name: 'DSH-Plugin',
  description: 'Public candidate',
  default_branch: 'main',
  readme_excerpt: 'README',
  license_spdx: 'MIT',
  stars: 42,
  upstream_updated_at: '2026-08-20T12:00:00.000Z',
  version: '1.0.0',
  commit_sha: 'a'.repeat(40),
  package_name: '@example/dsh-plugin',
  package_integrity: `sha512-${'a'.repeat(64)}`,
  dsh_compatibility: '^0.1.0',
  category: 'Coding',
  permissions: [],
  risk_level: 'LOW',
  risk_reasons: ['NO_HIGH_RISK_SIGNAL_DETECTED', 'AUTOMATED_ASSESSMENT'],
  risk_assessed_at: '2026-08-20T12:00:00.000Z',
  risk_model_version: 'hhrisk-1',
  metadata_sha256: 'b'.repeat(64),
  discovered_at: '2026-08-20T12:00:00.000Z',
  status: 'COLLECTED_UNVERIFIED',
  retry_count: 0,
  last_error: null,
}

describe('DiscoveryService', () => {
  it('stores discovered candidates without granting trust', async () => {
    let stored: PublicSourceCandidate[] = []
    const repository: CandidatePluginRepository = {
      list: async () => ({ items: [], total: stored.length }),
      upsertMany: async (items) => { stored = items; return items.length },
      latestObservedAt: async () => null,
    }
    const adapter: SourceAggregationAdapter = { discover: async () => [candidate] }
    const service = new DiscoveryService(repository, adapter)

    await expect(service.refresh()).resolves.toMatchObject({ status: 'SUCCESS', discovered: 1, stored: 1 })
    expect(stored[0]?.status).toBe('COLLECTED_UNVERIFIED')
  })

  it('honors the database-backed cooldown reservation', async () => {
    const repository: CandidatePluginRepository = {
      list: async () => ({ items: [], total: 8 }),
      upsertMany: async () => 0,
      latestObservedAt: async () => new Date(),
    }
    const adapter: SourceAggregationAdapter = { discover: async () => { throw new Error('must not run') } }
    const service = new DiscoveryService(repository, adapter)
    await expect(service.refresh()).resolves.toMatchObject({ status: 'COOLDOWN', stored: 8 })
  })
})
