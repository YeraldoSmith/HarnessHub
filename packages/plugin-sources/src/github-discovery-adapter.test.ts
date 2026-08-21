import { describe, expect, it } from 'vitest'

import { GitHubDiscoveryAdapter } from './github-discovery-adapter.js'

describe('GitHub public source discovery', () => {
  it('does not put metadata-only repositories in the installable marketplace output', async () => {
    const fetcher = (async () => new Response(JSON.stringify({
      items: [{
        id: 501,
        name: 'dsh-plugin',
        full_name: 'example/dsh-plugin',
        html_url: 'https://github.com/example/dsh-plugin',
        description: 'Example public plugin',
        default_branch: 'main',
        owner: { login: 'example' },
        license: { spdx_id: 'MIT' },
        stargazers_count: 42,
        updated_at: '2026-08-20T11:00:00.000Z',
      }],
    }), { status: 200 })) as typeof fetch
    const adapter = new GitHubDiscoveryAdapter({
      fetch: fetcher,
      clock: () => new Date('2026-08-20T12:00:00.000Z'),
      queries: ['topic:deepseek-harness', 'dsh plugin'],
      detailLimit: 0,
    })

    const candidates = await adapter.discover()
    expect(candidates).toEqual([])
  })

  it('enriches README, commit, package metadata and retries a transient failure', async () => {
    let commitAttempts = 0
    const repository = {
      id: 502,
      name: 'dsh-tools',
      full_name: 'example/dsh-tools',
      html_url: 'https://github.com/example/dsh-tools',
      description: 'Tools for DSH',
      default_branch: 'main',
      owner: { login: 'example' },
      license: { spdx_id: 'Apache-2.0' },
      stargazers_count: 8,
      updated_at: '2026-08-20T11:30:00.000Z',
    }
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/search/repositories')) return new Response(JSON.stringify({ items: [repository] }), { status: 200 })
      if (url.endsWith('/commits/main')) {
        commitAttempts += 1
        if (commitAttempts === 1) return new Response('{}', { status: 502 })
        return new Response(JSON.stringify({ sha: 'c'.repeat(40) }), { status: 200 })
      }
      if (url.includes('/readme?ref=')) {
        return new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from('# DSH Tools').toString('base64') }), { status: 200 })
      }
      if (url.includes('/contents/package.json?ref=')) {
        const manifest = {
          name: '@example/dsh-tools', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': '^0.1.0' },
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }
        return new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from(JSON.stringify(manifest)).toString('base64') }), { status: 200 })
      }
      if (url.includes('/contents/cordis.patch.yml?ref=')) {
        return new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from('- id: example').toString('base64') }), { status: 200 })
      }
      if (url.startsWith('https://registry.npmjs.org/')) {
        return new Response(JSON.stringify({
          'dist-tags': { latest: '1.0.0' },
          versions: {
            '1.0.0': {
              dist: { integrity: 'sha512-example' },
              peerDependencies: { '@deepseek-ai/dsh': '^0.1.0' },
              dsh: { bundle: { patch: './cordis.patch.yml' } },
            },
          },
        }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch
    const adapter = new GitHubDiscoveryAdapter({
      fetch: fetcher,
      clock: () => new Date('2026-08-20T12:00:00.000Z'),
      queries: ['topic:dsh-plugin'],
      detailLimit: 1,
      retries: 2,
    })

    const [result] = await adapter.discover()
    expect(result).toMatchObject({
      readme_excerpt: '# DSH Tools',
      commit_sha: 'c'.repeat(40),
      package_name: '@example/dsh-tools',
      version: '1.0.0',
      package_integrity: 'sha512-example',
      dsh_bundle_patch: './cordis.patch.yml',
      dsh_compatibility: '^0.1.0',
      risk_level: 'LOW',
      last_error: null,
    })
    expect(commitAttempts).toBe(2)
  })

  it('does not create install evidence when the pinned source patch is missing', async () => {
    const repository = {
      id: 504,
      name: 'dsh-missing-patch',
      full_name: 'example/dsh-missing-patch',
      html_url: 'https://github.com/example/dsh-missing-patch',
      description: 'A DSH plugin candidate',
      default_branch: 'main',
      owner: { login: 'example' },
      license: { spdx_id: 'MIT' },
      stargazers_count: 1,
      updated_at: '2026-08-20T11:30:00.000Z',
    }
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/search/repositories')) return new Response(JSON.stringify({ items: [repository] }), { status: 200 })
      if (url.endsWith('/commits/main')) return new Response(JSON.stringify({ sha: 'd'.repeat(40) }), { status: 200 })
      if (url.includes('/contents/package.json?ref=')) {
        return new Response(JSON.stringify({
          encoding: 'base64',
          content: Buffer.from(JSON.stringify({
            name: '@example/dsh-missing-patch', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
          })).toString('base64'),
        }), { status: 200 })
      }
      if (url.startsWith('https://registry.npmjs.org/')) {
        return new Response(JSON.stringify({
          versions: { '1.0.0': { dist: { integrity: 'sha512-example' }, dsh: { bundle: { patch: './cordis.patch.yml' } } } },
        }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    const candidates = await new GitHubDiscoveryAdapter({ fetch: fetcher, queries: ['topic:dsh-plugin'], detailLimit: 1 }).discover()
    expect(candidates).toEqual([])
  })

  it('discovers independently installable Bundles declared by a workspace root', async () => {
    const repository = {
      id: 505, name: 'dsh-workspace', full_name: 'example/dsh-workspace', html_url: 'https://github.com/example/dsh-workspace',
      description: 'DSH workspace', default_branch: 'main', owner: { login: 'example' }, license: { spdx_id: 'MIT' },
      stargazers_count: 1, updated_at: '2026-08-20T11:30:00.000Z', topics: ['dsh-plugin'],
    }
    const content = (value: unknown) => new Response(JSON.stringify({
      encoding: 'base64', content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64'),
    }), { status: 200 })
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/search/repositories')) return new Response(JSON.stringify({ items: [repository] }), { status: 200 })
      if (url.endsWith('/commits/main')) return new Response(JSON.stringify({ sha: 'e'.repeat(40) }), { status: 200 })
      if (url.includes('/contents/package.json?ref=')) return content({ dsh: { bundles: ['./packages/vision'] } })
      if (url.includes('/contents/packages/vision/package.json?ref=')) return content({
        name: '@example/dsh-vision', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
      })
      if (url.includes('/contents/packages/vision/cordis.patch.yml?ref=')) return content('- id: example')
      if (url.startsWith('https://registry.npmjs.org/')) return new Response(JSON.stringify({
        versions: { '1.0.0': { dist: { integrity: 'sha512-example' }, dsh: { bundle: { patch: './cordis.patch.yml' } } } },
      }), { status: 200 })
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    const candidates = await new GitHubDiscoveryAdapter({ fetch: fetcher, queries: ['topic:dsh-plugin'], detailLimit: 1 }).discover()
    expect(candidates).toContainEqual(expect.objectContaining({
      external_id: '505:packages/vision', bundle_directory: 'packages/vision', package_name: '@example/dsh-vision',
      version: '1.0.0', dsh_bundle_patch: './cordis.patch.yml',
    }))
  })

  it('does not turn an incomplete successful search result into an installable plugin', async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const query = url.searchParams.get('q')
      if (query === 'rate-limited') {
        return new Response('{}', {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
          },
        })
      }
      return new Response(JSON.stringify({
        items: [{
          id: 503,
          name: 'dsh-research-plugin',
          full_name: 'example/dsh-research-plugin',
          html_url: 'https://github.com/example/dsh-research-plugin',
          description: 'A DSH plugin for research',
          default_branch: 'main',
          owner: { login: 'example' },
          license: { spdx_id: 'MIT' },
          stargazers_count: 3,
          updated_at: '2026-08-20T11:45:00.000Z',
          topics: ['dsh-plugin'],
        }],
      }), { status: 200 })
    }) as typeof fetch
    const adapter = new GitHubDiscoveryAdapter({
      fetch: fetcher,
      queries: ['rate-limited', 'topic:dsh-plugin'],
      detailLimit: 0,
      retries: 2,
      concurrency: 2,
    })

    const candidates = await adapter.discover()

    expect(candidates).toEqual([])
  })

  it('supports bounded pagination and deduplicates repositories across pages', async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/commits/main')) return new Response(JSON.stringify({ sha: 'f'.repeat(40) }), { status: 200 })
      if (url.pathname.endsWith('/contents/package.json')) return new Response(JSON.stringify({
        encoding: 'base64',
        content: Buffer.from(JSON.stringify({ name: '@example/dsh-page', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } })).toString('base64'),
      }), { status: 200 })
      if (url.pathname.endsWith('/contents/cordis.patch.yml')) return new Response(JSON.stringify({
        encoding: 'base64', content: Buffer.from('- id: page').toString('base64'),
      }), { status: 200 })
      if (url.hostname === 'registry.npmjs.org') return new Response(JSON.stringify({
        versions: { '1.0.0': { dist: { integrity: 'sha512-example' }, dsh: { bundle: { patch: './cordis.patch.yml' } } } },
      }), { status: 200 })
      const page = Number(url.searchParams.get('page'))
      const repository = page === 1
        ? {
            id: 504,
            name: 'dsh-page-one',
            full_name: 'example/dsh-page-one',
            html_url: 'https://github.com/example/dsh-page-one',
            description: 'DSH plugin page one',
            default_branch: 'main',
            owner: { login: 'example' },
            license: { spdx_id: 'MIT' },
            stargazers_count: 1,
            updated_at: '2026-08-20T10:00:00.000Z',
            topics: ['dsh-plugin'],
          }
        : {
            id: 505,
            name: 'dsh-page-two',
            full_name: 'example/dsh-page-two',
            html_url: 'https://github.com/example/dsh-page-two',
            description: 'DSH plugin page two',
            default_branch: 'main',
            owner: { login: 'example' },
            license: { spdx_id: 'MIT' },
            stargazers_count: 2,
            updated_at: '2026-08-20T11:00:00.000Z',
            topics: ['dsh-plugin'],
          }
      return new Response(JSON.stringify({ items: [repository] }), { status: 200 })
    }) as typeof fetch
    const adapter = new GitHubDiscoveryAdapter({
      fetch: fetcher,
      queries: ['topic:dsh-plugin'],
      perQuery: 1,
      pagesPerQuery: 2,
      detailLimit: 2,
    })

    const candidates = await adapter.discover()

    expect(candidates.map((candidate) => candidate.repository)).toEqual([
      'example/dsh-page-one',
      'example/dsh-page-two',
    ])
  })
})
