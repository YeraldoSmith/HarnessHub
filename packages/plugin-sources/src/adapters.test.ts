import { describe, expect, it } from 'vitest'

import { GitHubSourceAdapter } from './github-adapter.js'
import { NpmSourceAdapter } from './npm-adapter.js'
import { PluginSourceSync } from './plugin-source-sync.js'

const repository = 'example/dsh-example'
const commit = 'a'.repeat(40)
const now = new Date('2026-08-20T01:02:03.000Z')
const packageManifest = {
  name: '@example/dsh-example',
  version: '1.2.0',
  description: 'Example DSH bundle',
  license: 'MIT',
  repository: { type: 'git', url: 'git+https://github.com/example/dsh-example.git' },
  peerDependencies: {
    '@deepseek-ai/dsh-llm': '>=0.1.0-rc.6 <0.2.0',
  },
  dsh: { bundle: { patch: './cordis.patch.yml' } },
  dist: {
    integrity: 'sha512-test',
    tarball: 'https://registry.npmjs.org/example.tgz',
  },
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function text(value: string, status = 200) {
  return new Response(value, { status, headers: { 'content-type': 'text/plain' } })
}

function createFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    if (url === `https://api.github.com/repos/${repository}`) {
      return json({
        default_branch: 'main',
        description: 'Repository description',
        html_url: `https://github.com/${repository}`,
        owner: { login: 'example' },
        license: { spdx_id: 'MIT' },
      })
    }
    if (url === `https://api.github.com/repos/${repository}/commits/main`) {
      return json({ sha: commit })
    }
    if (url === `https://api.github.com/repos/${repository}/readme?ref=${commit}`) {
      return text('# Example\nA DSH plugin.')
    }
    if (url === `https://api.github.com/repos/${repository}/contents/package.json?ref=${commit}`) {
      return text(JSON.stringify(packageManifest))
    }
    if (url === `https://api.github.com/repos/${repository}/releases/latest`) {
      return json({ tag_name: 'v1.2.0' })
    }
    if (url === 'https://registry.npmjs.org/%40example%2Fdsh-example') {
      return json({
        'dist-tags': { latest: '1.2.0' },
        versions: { '1.2.0': packageManifest },
      })
    }
    return text('not found', 404)
  }) as typeof fetch
}

describe('source adapters', () => {
  it('captures immutable GitHub evidence', async () => {
    const adapter = new GitHubSourceAdapter({ fetch: createFetch(), clock: () => now })
    const result = await adapter.fetch(repository)

    expect(result.commit_sha).toBe(commit)
    expect(result.release_tag).toBe('v1.2.0')
    expect(result.evidence.readme_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.evidence.fetched_at).toBe(now.toISOString())
  })

  it('captures exact npm version and integrity', async () => {
    const adapter = new NpmSourceAdapter({ fetch: createFetch(), clock: () => now })
    const result = await adapter.fetch('@example/dsh-example')

    expect(result.version).toBe('1.2.0')
    expect(result.evidence.integrity).toBe('sha512-test')
    expect(result.dsh_compatibility).toBe('>=0.1.0-rc.6 <0.2.0')
  })

  it('creates a cross-checked plugin snapshot', async () => {
    const sync = new PluginSourceSync({ fetch: createFetch(), clock: () => now })
    const snapshot = await sync.createSnapshot({
      id: 'dsh-example',
      display_name: 'DSH Example',
      category: 'Development',
      tags: ['example'],
      github: { repository },
      npm: { package_name: '@example/dsh-example' },
    })

    expect(snapshot.plugin.is_mock).toBe(false)
    expect(snapshot.plugin.source_commit).toBe(commit)
    expect(snapshot.plugin.source_evidence).toHaveLength(2)
  })

  it('rejects a GitHub/npm package identity mismatch', async () => {
    const baseFetch = createFetch()
    const mismatchedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('/contents/package.json')) {
        return text(JSON.stringify({ ...packageManifest, name: '@example/different-package' }))
      }
      return baseFetch(input, init)
    }) as typeof fetch
    const sync = new PluginSourceSync({ fetch: mismatchedFetch, clock: () => now })

    await expect(
      sync.createSnapshot({
        id: 'dsh-example',
        display_name: 'DSH Example',
        category: 'Development',
        tags: ['example'],
        github: { repository },
        npm: { package_name: '@example/dsh-example' },
      }),
    ).rejects.toThrow('Source mismatch')
  })
})
