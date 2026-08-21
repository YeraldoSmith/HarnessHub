import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Plugin } from '@harnesshub/types'

import {
  installableEvidence,
  managedPluginForRegistryEntry,
  pluginInstallationPolicy,
  resolveInstallableEvidence,
} from './native-runtime.js'

afterEach(() => vi.unstubAllGlobals())

function plugin(status: 'AVAILABLE' | 'UNAVAILABLE' = 'AVAILABLE'): Plugin {
  return {
    id: 'dsh-workbench',
    name: 'DSH Workbench',
    description: 'test',
    source: 'github+npm',
    github_url: 'https://github.com/lee259/dsh-workbench',
    npm_url: 'https://www.npmjs.com/package/dsh-workbench/v/0.8.0',
    author: { name: 'lee259', handle: 'lee259' },
    version: '0.8.0',
    category: 'Coding',
    tags: [],
    permissions: [],
    compatibility: { dsh: '*', status: 'declared' },
    license: { spdx: 'MIT', name: 'MIT', url: null },
    source_commit: '5c4f6a66c600de3908e452be2355e27f1f9cb813',
    npm_version: '0.8.0',
    checked_at: '2026-08-20T00:00:00.000Z',
    source_evidence: [{
      provider: 'npm',
      url: 'https://registry.npmjs.org/dsh-workbench/-/dsh-workbench-0.8.0.tgz',
      repository_url: 'https://github.com/lee259/dsh-workbench',
      package_name: 'dsh-workbench',
      fetched_at: '2026-08-20T00:00:00.000Z',
      commit_sha: null,
      release_tag: null,
      npm_version: '0.8.0',
      integrity: 'sha512-proof',
      readme_sha256: null,
      license_spdx: 'MIT',
    }],
    source_status: [{ provider: 'npm', status, last_verified_at: '2026-08-20T00:00:00.000Z', unavailable_since: null, error: null }],
    is_mock: false,
  }
}

describe('managed plugin evidence boundary', () => {
  it('uses only an available npm source with a pinned version and sha512 integrity', () => {
    expect(installableEvidence(plugin())).toEqual({
      packageName: 'dsh-workbench',
      version: '0.8.0',
      integrity: 'sha512-proof',
      sourceKind: 'NPM',
      sourceUrl: 'https://github.com/lee259/dsh-workbench',
      sourceCommit: '5c4f6a66c600de3908e452be2355e27f1f9cb813',
      riskLevel: 'LOW',
      requiredConfirmations: 1,
    })
  })

  it('does not use an unavailable marker as an installation policy block', () => {
    expect(installableEvidence(plugin('UNAVAILABLE'))).toMatchObject({
      packageName: 'dsh-workbench',
      requiredConfirmations: 1,
    })
  })

  it('allows risk-assessed candidates with pinned npm, commit, and snapshot evidence', () => {
    const candidate = {
      ...plugin(),
      tags: ['installable-bundle'],
      registry_status: 'COLLECTED_UNVERIFIED' as const,
      risk_level: 'MEDIUM' as const,
      discovery_snapshot_sha256: 'b'.repeat(64),
    }
    expect(installableEvidence(candidate)).toMatchObject({
      packageName: 'dsh-workbench',
      version: '0.8.0',
      riskLevel: 'MEDIUM',
      requiredConfirmations: 2,
    })
  })

  it('allows a catalog bundle only when its Git source is pinned to the displayed commit', () => {
    const commit = 'c'.repeat(40)
    const candidate: Plugin = {
      ...plugin(),
      source: 'github',
      npm_url: null,
      source_commit: commit,
      tags: ['installable-bundle'],
      registry_status: 'COLLECTED_UNVERIFIED',
      risk_level: 'HIGH',
      source_evidence: [{
        provider: 'github', url: 'https://github.com/example/dsh-git-plugin',
        repository_url: 'https://github.com/example/dsh-git-plugin', package_name: 'dsh-git-plugin',
        fetched_at: '2026-08-21T00:00:00.000Z', commit_sha: commit, release_tag: null,
        npm_version: '1.0.0', integrity: `git-commit:${commit}`, readme_sha256: null, license_spdx: 'MIT',
      }],
    }
    expect(installableEvidence(candidate)).toMatchObject({
      packageName: 'dsh-git-plugin', sourceKind: 'GITHUB', sourceCommit: commit, requiredConfirmations: 2,
    })
    expect(installableEvidence({ ...candidate, source_commit: 'd'.repeat(40) })).toBeNull()
  })

  it('requires two confirmations for every unverified candidate and never policy-blocks CRITICAL', () => {
    const candidate = {
      ...plugin(),
      tags: ['installable-bundle'],
      registry_status: 'COLLECTED_UNVERIFIED' as const,
      risk_level: 'HIGH' as const,
      discovery_snapshot_sha256: 'b'.repeat(64),
    }
    expect(pluginInstallationPolicy(candidate)).toMatchObject({ requiredConfirmations: 2, blocked: false })
    expect(installableEvidence({ ...candidate, risk_level: 'CRITICAL' })).toMatchObject({
      requiredConfirmations: 2,
      riskLevel: 'CRITICAL',
    })
  })

  it('does not make an unverified GitHub repository installable at click time', async () => {
    const candidate = {
      ...plugin(),
      registry_status: 'COLLECTED_UNVERIFIED' as const,
      risk_level: 'HIGH' as const,
      npm_url: null,
      npm_version: null,
      source_commit: null,
      source_evidence: plugin().source_evidence.filter((evidence) => evidence.provider !== 'npm'),
    }
    await expect(resolveInstallableEvidence(candidate)).rejects.toThrow('固定 DSH bundle 证据')
  })

  it('does not expose install evidence for a source-only discovered repository', () => {
    expect(installableEvidence({
      ...plugin(),
      registry_status: 'COLLECTED_UNVERIFIED',
      risk_level: 'HIGH',
    })).toBeNull()
  })

  it('keeps local installation identity stable when a Registry refresh changes the plugin ID', () => {
    const refreshed = { ...plugin(), id: 'github-lee259-dsh-workbench' }
    const installed = {
      pluginId: 'dsh-workbench',
      packageName: 'dsh-workbench',
      version: '0.8.0',
      integrity: 'sha512-proof',
      installedAtUnixMs: 1,
    }
    expect(managedPluginForRegistryEntry(refreshed, [installed])).toEqual(installed)
  })

  it('still finds an installed record when current source evidence becomes unavailable', () => {
    const unavailable = plugin('UNAVAILABLE')
    expect(installableEvidence(unavailable)).not.toBeNull()
    expect(managedPluginForRegistryEntry(unavailable, [{
      pluginId: 'older-registry-id',
      packageName: 'dsh-workbench',
      version: '0.8.0',
      integrity: 'sha512-proof',
      installedAtUnixMs: 1,
    }])?.packageName).toBe('dsh-workbench')
  })
})
