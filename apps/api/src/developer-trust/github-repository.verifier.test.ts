import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PublicGitHubRepositoryVerifier,
} from './github-repository.verifier.js'

afterEach(() => vi.restoreAllMocks())

describe('PublicGitHubRepositoryVerifier', () => {
  it('records stable repository and owner IDs, then reads challenge commit evidence', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 12345,
        html_url: 'https://github.com/example/plugin',
        full_name: 'example/plugin',
        default_branch: 'main',
        private: false,
        archived: false,
        owner: { id: 7788, type: 'Organization' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: 'file',
        encoding: 'base64',
        size: 20,
        sha: 'a'.repeat(40),
        content: Buffer.from('exact challenge').toString('base64'),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ sha: 'b'.repeat(40) }]), { status: 200 }))

    const verifier = new PublicGitHubRepositoryVerifier()
    const repository = await verifier.describe('https://github.com/example/plugin.git')
    const observation = await verifier.observe(
      repository,
      '.harnesshub/claims/b65ef191-4bf0-47f4-815b-269f00752aa4.txt',
      'main',
    )

    expect(repository).toMatchObject({
      externalId: '12345',
      ownerExternalId: '7788',
      ownerType: 'ORGANIZATION',
    })
    expect(observation).toMatchObject({
      content: 'exact challenge',
      blobSha: 'a'.repeat(40),
      commitSha: 'b'.repeat(40),
    })
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/contents/.harnesshub/claims/')
  })

  it('rejects non-canonical and non-GitHub source URLs', async () => {
    const verifier = new PublicGitHubRepositoryVerifier()
    await expect(verifier.describe('https://github.example/example/plugin')).rejects.toMatchObject({
      code: 'INVALID_REPOSITORY_URL',
    })
    await expect(verifier.describe('https://github.com/example/plugin/issues')).rejects.toMatchObject({
      code: 'INVALID_REPOSITORY_URL',
    })
  })

  it('treats a missing proof file as a claim failure without inventing evidence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 404 }))
    const verifier = new PublicGitHubRepositoryVerifier()
    await expect(
      verifier.observe(
        {
          externalId: '1',
          canonicalUrl: 'https://github.com/example/plugin',
          fullName: 'example/plugin',
          defaultBranch: 'main',
          ownerType: 'USER',
          ownerExternalId: '2',
          private: false,
          archived: false,
        },
        '.harnesshub/claims/b65ef191-4bf0-47f4-815b-269f00752aa4.txt',
        'main',
      ),
    ).rejects.toMatchObject({ code: 'CHALLENGE_NOT_FOUND' })
  })
})
