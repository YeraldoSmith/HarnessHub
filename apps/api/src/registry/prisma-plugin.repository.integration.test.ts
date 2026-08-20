import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { PluginSnapshot } from '@harnesshub/types'

import { PrismaService } from '../database/prisma.service.js'
import { PrismaSyncJobRepository } from '../sync/prisma-sync-job.repository.js'
import { PrismaPluginRepository } from './prisma-plugin.repository.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests.')
}
if (!testDatabaseUrl.includes('schema=harnesshub_test')) {
  throw new Error("TEST_DATABASE_URL must target the isolated 'harnesshub_test' schema.")
}

process.env.DATABASE_URL = testDatabaseUrl

const prisma = new PrismaService()
const repository = new PrismaPluginRepository(prisma)
const syncJobs = new PrismaSyncJobRepository(prisma)
const snapshot: PluginSnapshot = {
  checked_at: '2026-08-20T03:00:00.000Z',
  plugin: {
    id: 'integration-registry-plugin',
    name: 'Integration Registry Plugin',
    description: 'A non-production record used only in the isolated integration-test schema.',
    source: 'github+npm',
    github_url: 'https://github.com/example/integration-registry-plugin',
    npm_url: 'https://www.npmjs.com/package/@example/integration-registry-plugin/v/1.0.0',
    author: { name: 'example', handle: 'example' },
    version: '1.0.0',
    category: 'Testing',
    tags: ['integration', 'testing'],
    permissions: [],
    compatibility: { dsh: '>=0.1.0-rc.6 <0.2.0', status: 'declared' },
    license: { spdx: 'MIT', name: 'MIT', url: 'https://spdx.org/licenses/MIT.html' },
    source_commit: 'b'.repeat(40),
    npm_version: '1.0.0',
    checked_at: '2026-08-20T03:00:00.000Z',
    source_evidence: [
      {
        provider: 'github',
        url: `https://github.com/example/integration-registry-plugin/tree/${'b'.repeat(40)}`,
        repository_url: 'https://github.com/example/integration-registry-plugin',
        package_name: null,
        fetched_at: '2026-08-20T03:00:00.000Z',
        commit_sha: 'b'.repeat(40),
        release_tag: 'v1.0.0',
        npm_version: null,
        integrity: null,
        readme_sha256: 'c'.repeat(64),
        license_spdx: 'MIT',
      },
      {
        provider: 'npm',
        url: 'https://registry.npmjs.org/@example/integration-registry-plugin/-/integration-registry-plugin-1.0.0.tgz',
        repository_url: 'https://github.com/example/integration-registry-plugin',
        package_name: '@example/integration-registry-plugin',
        fetched_at: '2026-08-20T03:00:00.000Z',
        commit_sha: null,
        release_tag: null,
        npm_version: '1.0.0',
        integrity: 'sha512-integration-test',
        readme_sha256: null,
        license_spdx: 'MIT',
      },
    ],
    source_status: [
      {
        provider: 'github',
        status: 'AVAILABLE',
        last_verified_at: '2026-08-20T03:00:00.000Z',
        unavailable_since: null,
        error: null,
      },
      {
        provider: 'npm',
        status: 'AVAILABLE',
        last_verified_at: '2026-08-20T03:00:00.000Z',
        unavailable_since: null,
        error: null,
      },
    ],
    is_mock: false,
  },
}

beforeAll(async () => {
  await prisma.$connect()
})

afterAll(async () => {
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "harnesshub_test" CASCADE')
  await prisma.$disconnect()
})

describe.sequential('PrismaPluginRepository', () => {
  it('deduplicates an immutable version while appending each source snapshot', async () => {
    await repository.saveSnapshot(snapshot)
    await repository.saveSnapshot({
      ...snapshot,
      checked_at: '2026-08-20T03:01:00.000Z',
      plugin: { ...snapshot.plugin, checked_at: '2026-08-20T03:01:00.000Z' },
    })

    await expect(prisma.plugin.count()).resolves.toBe(1)
    await expect(prisma.pluginVersion.count()).resolves.toBe(1)
    await expect(prisma.pluginSource.count()).resolves.toBe(2)
    await expect(prisma.pluginSnapshot.count()).resolves.toBe(2)
    await expect(repository.listSnapshots(snapshot.plugin.id)).resolves.toHaveLength(2)
  })

  it('rejects mutations of immutable version records', async () => {
    await expect(
      prisma.pluginVersion.updateMany({
        where: { pluginId: snapshot.plugin.id },
        data: { version: 'mutated' },
      }),
    ).rejects.toThrow('plugin_versions rows are immutable')
  })

  it('paginates and searches PostgreSQL fields including author and tags', async () => {
    await repository.saveSnapshot({
      ...snapshot,
      plugin: {
        ...snapshot.plugin,
        id: 'alpha-pagination-plugin',
        name: 'Alpha Pagination Plugin',
        author: { name: 'Pagination Author', handle: 'pagination-author' },
        tags: ['pagination', 'database'],
      },
    })

    const first = await repository.list({ page: 1, limit: 1 })
    const second = await repository.list({ page: 2, limit: 1 })
    const authorSearch = await repository.list({ query: 'Pagination Author', page: 1, limit: 20 })
    const tagSearch = await repository.list({ query: 'database', page: 1, limit: 20 })

    expect(first.total).toBe(2)
    expect(first.items).toHaveLength(1)
    expect(second.items).toHaveLength(1)
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id)
    expect(authorSearch.items.map((plugin) => plugin.id)).toEqual(['alpha-pagination-plugin'])
    expect(tagSearch.items.map((plugin) => plugin.id)).toEqual(['alpha-pagination-plugin'])
  })

  it('records SyncJob lifecycle transitions', async () => {
    const job = await syncJobs.create(snapshot.plugin.id, 'github+npm')
    await expect(syncJobs.start(job.id)).resolves.toMatchObject({ status: 'RUNNING' })
    await expect(syncJobs.fail(job.id, 'upstream timeout')).resolves.toMatchObject({
      status: 'FAILED',
      error: 'upstream timeout',
    })
    const successJob = await syncJobs.create(snapshot.plugin.id, 'github+npm')
    await syncJobs.start(successJob.id)
    await expect(syncJobs.succeed(successJob.id)).resolves.toMatchObject({
      status: 'SUCCESS',
      error: null,
    })
    const jobs = await syncJobs.list(snapshot.plugin.id)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: job.id, status: 'FAILED' }),
        expect.objectContaining({ id: successJob.id, status: 'SUCCESS' }),
      ]),
    )
  })

  it('marks an upstream source unavailable without deleting snapshots', async () => {
    const snapshotCount = await prisma.pluginSnapshot.count({
      where: { pluginVersion: { pluginId: snapshot.plugin.id } },
    })
    await expect(
      repository.markSourceUnavailable(snapshot.plugin.id, 'github', 'Source request failed with status 404.'),
    ).resolves.toBe(1)

    const plugin = await repository.getById(snapshot.plugin.id)
    expect(plugin?.source_status).toContainEqual(
      expect.objectContaining({ provider: 'github', status: 'UNAVAILABLE' }),
    )
    await expect(
      prisma.pluginSnapshot.count({ where: { pluginVersion: { pluginId: snapshot.plugin.id } } }),
    ).resolves.toBe(snapshotCount)
  })
})
