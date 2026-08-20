import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { PluginSnapshot } from '@harnesshub/types'

import { PrismaService } from '../database/prisma.service.js'
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

describe('PrismaPluginRepository', () => {
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
})
