import { describe, expect, it } from 'vitest'

import { GitHubDiscoveryAdapter } from './github-discovery-adapter.js'

describe('GitHub public source discovery', () => {
  it('collects and deduplicates metadata without assigning trust', async () => {
    const fetcher = (async () => new Response(JSON.stringify({
      items: [{
        id: 501,
        full_name: 'example/dsh-plugin',
        html_url: 'https://github.com/example/dsh-plugin',
        description: 'Example public plugin',
        default_branch: 'main',
        owner: { login: 'example' },
        license: { spdx_id: 'MIT' },
      }],
    }), { status: 200 })) as typeof fetch
    const adapter = new GitHubDiscoveryAdapter({
      fetch: fetcher,
      clock: () => new Date('2026-08-20T12:00:00.000Z'),
      queries: ['topic:deepseek-harness', 'dsh plugin'],
    })

    const candidates = await adapter.discover()
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      repository: 'example/dsh-plugin',
      status: 'COLLECTED_UNVERIFIED',
      commit_sha: null,
      package_integrity: null,
    })
    expect(candidates[0]?.metadata_sha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
