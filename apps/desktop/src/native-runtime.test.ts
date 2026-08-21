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

  it('requires two confirmations for every unverified candidate and never policy-blocks CRITICAL', () => {
    const candidate = {
      ...plugin(),
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

  it('resolves missing npm evidence to a commit-pinned GitHub installation', async () => {
    const candidate = {
      ...plugin(),
      registry_status: 'COLLECTED_UNVERIFIED' as const,
      risk_level: 'HIGH' as const,
      npm_url: null,
      npm_version: null,
      source_commit: null,
      source_evidence: plugin().source_evidence.filter((evidence) => evidence.provider !== 'npm'),
    }
    const encodedManifest = btoa(JSON.stringify({
      name: 'dsh-workbench',
      version: '0.8.0',
    }))
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/repos/lee259/dsh-workbench')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.endsWith('/commits/main')) {
        return new Response(JSON.stringify({ sha: 'c'.repeat(40) }), { status: 200 })
      }
      if (url.includes('/contents/package.json?ref=')) {
        return new Response(JSON.stringify({ encoding: 'base64', content: encodedManifest }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }))

    await expect(resolveInstallableEvidence(candidate)).resolves.toMatchObject({
      packageName: 'dsh-workbench',
      version: '0.8.0',
      integrity: `git-commit:${'c'.repeat(40)}`,
      sourceKind: 'GITHUB',
      requiredConfirmations: 2,
    })
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
