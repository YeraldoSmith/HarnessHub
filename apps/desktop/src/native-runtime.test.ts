import { describe, expect, it } from 'vitest'

import type { Plugin } from '@harnesshub/types'

import { installableEvidence } from './native-runtime.js'

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
    })
  })

  it('blocks an unavailable upstream without deleting its historical record', () => {
    expect(installableEvidence(plugin('UNAVAILABLE'))).toBeNull()
  })
})
