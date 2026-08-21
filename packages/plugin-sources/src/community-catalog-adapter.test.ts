import { describe, expect, it } from 'vitest'

import { CommunityCatalogAdapter } from './community-catalog-adapter.js'

describe('community catalog discovery', () => {
  it('imports only bounded, pinned DSH Bundles as unverified Git candidates', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ plugins: [
      {
        repository: 'example/dsh-valid', url: 'https://github.com/example/dsh-valid', description: 'A DSH tool',
        defaultBranch: 'main', license: 'MIT', stars: 4, updatedAt: '2026-08-21T00:00:00Z',
        commit: 'a'.repeat(40), package: { name: '@example/dsh-valid', version: '1.2.3', bundlePatch: 'cordis.patch.yml' },
      },
      {
        repository: 'example/dsh-invalid', url: 'https://github.com/example/dsh-invalid', commit: 'not-a-commit',
        package: { name: '@example/dsh-invalid', version: '1.0.0', bundlePatch: 'cordis.patch.yml' },
      },
      {
        repository: 'example/dsh-path', url: 'https://github.com/example/dsh-path', commit: 'b'.repeat(40),
        package: { name: '@example/dsh-path', version: '1.0.0', bundlePatch: '../outside.yml' },
      },
    ] }), { status: 200 })) as typeof fetch

    const candidates = await new CommunityCatalogAdapter({
      fetch: fetcher,
      maxEntries: 200,
      clock: () => new Date('2026-08-21T01:00:00Z'),
    }).discover()

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      repository: 'example/dsh-valid', package_name: '@example/dsh-valid', version: '1.2.3',
      commit_sha: 'a'.repeat(40), package_integrity: `git-commit:${'a'.repeat(40)}`,
      dsh_bundle_patch: './cordis.patch.yml', status: 'COLLECTED_UNVERIFIED',
    })
  })
})
