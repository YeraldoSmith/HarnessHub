import { describe, expect, it } from 'vitest'

import {
  bundledRegistry,
  candidateToPlugin,
  loadDesktopRegistry,
  publicSourceToCandidate,
} from './registry-client.js'

describe('Desktop Registry client', () => {
  it('ships a validated production snapshot instead of mock data', () => {
    expect(bundledRegistry.total).toBeGreaterThanOrEqual(20)
    expect(bundledRegistry.items).toHaveLength(bundledRegistry.total)
    expect(bundledRegistry.items.every((plugin) => !plugin.is_mock)).toBe(true)
    expect(bundledRegistry.items.every((plugin) => plugin.source_evidence.length >= 2)).toBe(true)
  })

  it('uses the bundled snapshot when the API is offline', async () => {
    const result = await loadDesktopRegistry(async () => {
      throw new TypeError('Load failed')
    })

    expect(result.source).toBe('BUNDLED')
    expect(result.registry.items).toHaveLength(bundledRegistry.items.length)
  })

  it('prefers a valid live Registry response', async () => {
    const result = await loadDesktopRegistry(async () => new Response(JSON.stringify(bundledRegistry), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(result.source).toBe('LIVE')
  })

  it('maps discovered sources to visibly unverified, non-installable marketplace records', () => {
    const plugin = candidateToPlugin({
      id: 'candidate-1', provider: 'github', external_id: '1', repository: 'example/dsh-plugin',
      repository_url: 'https://github.com/example/dsh-plugin', owner: 'example', name: 'dsh-plugin',
      description: 'Candidate', default_branch: 'main', readme_excerpt: '# Candidate', license_spdx: 'MIT',
      stars: 5, upstream_updated_at: '2026-08-20T11:00:00.000Z', commit_sha: 'a'.repeat(40),
      package_name: '@example/dsh-plugin', package_version: '1.0.0', package_integrity: 'sha512-proof',
      dsh_compatibility: '^0.1.0', metadata_sha256: 'b'.repeat(64),
      category: 'Coding', permissions: [{
        id: 'network', label: 'Network access', description: 'Connects to an API.', risk: 'medium',
      }], risk_level: 'MEDIUM', risk_reasons: ['DECLARED_RUNTIME_PERMISSIONS', 'AUTOMATED_ASSESSMENT'],
      risk_assessed_at: '2026-08-20T12:00:00.000Z', risk_model_version: 'hhrisk-1',
      discovered_at: '2026-08-20T12:00:00.000Z', last_observed_at: '2026-08-20T12:00:00.000Z',
      status: 'COLLECTED_UNVERIFIED', retry_count: 0, last_error: null,
    })

    expect(plugin.registry_status).toBe('COLLECTED_UNVERIFIED')
    expect(plugin.source_status[0]?.status).toBe('AVAILABLE')
    expect(plugin.category).toBe('Coding')
    expect(plugin.risk_level).toBe('MEDIUM')
    expect(plugin.discovery_snapshot_sha256).toBe('b'.repeat(64))
  })

  it('preserves public discovery evidence when converting a desktop result', () => {
    const candidate = publicSourceToCandidate({
      provider: 'github', external_id: '2', repository: 'example/dsh-data-plugin',
      repository_url: 'https://github.com/example/dsh-data-plugin', author: 'example',
      name: 'dsh-data-plugin', description: 'Data tools for DSH', default_branch: 'main',
      readme_excerpt: '# Data plugin', license_spdx: 'Apache-2.0', stars: 9,
      upstream_updated_at: '2026-08-20T11:00:00.000Z', commit_sha: 'c'.repeat(40),
      package_name: '@example/dsh-data-plugin', version: '1.2.0', package_integrity: 'sha512-proof',
      dsh_compatibility: '^0.1.0', category: 'Data', permissions: [], risk_level: 'LOW',
      risk_reasons: ['FIXED_SOURCE_EVIDENCE', 'AUTOMATED_ASSESSMENT'],
      risk_assessed_at: '2026-08-20T12:00:00.000Z', risk_model_version: 'hhrisk-1',
      metadata_sha256: 'd'.repeat(64), discovered_at: '2026-08-20T12:00:00.000Z',
      status: 'COLLECTED_UNVERIFIED', retry_count: 0, last_error: null,
    })

    expect(candidate).toMatchObject({
      id: `local-${'d'.repeat(32)}`,
      repository: 'example/dsh-data-plugin',
      commit_sha: 'c'.repeat(40),
      package_integrity: 'sha512-proof',
      status: 'COLLECTED_UNVERIFIED',
    })
  })
})
