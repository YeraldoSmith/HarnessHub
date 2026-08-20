import 'dotenv/config'

import { readFile } from 'node:fs/promises'

import {
  manualPluginSourceListSchema,
  PluginSourceSync,
  SourceFetchError,
} from '@harnesshub/plugin-sources'

import { PrismaService } from './database/prisma.service.js'
import { PrismaPluginRepository } from './registry/prisma-plugin.repository.js'
import { PrismaSyncJobRepository } from './sync/prisma-sync-job.repository.js'

function unavailableProvider(error: unknown): 'github' | 'npm' | null {
  if (!(error instanceof SourceFetchError) || ![404, 410].includes(error.status)) return null
  if (error.url.startsWith('https://api.github.com/')) return 'github'
  if (error.url.startsWith('https://registry.npmjs.org/')) return 'npm'
  return null
}

async function main() {
  const configUrl = new URL('../../../config/registry-sources.json', import.meta.url)
  const sources = manualPluginSourceListSchema.parse(JSON.parse(await readFile(configUrl, 'utf8')))
  const prisma = new PrismaService()
  const repository = new PrismaPluginRepository(prisma)
  const jobs = new PrismaSyncJobRepository(prisma)
  const sourceSync = new PluginSourceSync()

  await prisma.$connect()
  try {
    const failures: string[] = []
    for (const source of sources) {
      const job = await jobs.create(source.id, 'github+npm')
      try {
        await jobs.start(job.id)
        const snapshot = await sourceSync.createSnapshot(source)
        const plugin = await repository.saveSnapshot(snapshot)
        await jobs.succeed(job.id)
        console.log(
          `Synced ${plugin.name} ${plugin.version} at ${plugin.source_commit ?? 'no GitHub commit'}.`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const provider = unavailableProvider(error)
        if (provider) {
          await repository.markSourceUnavailable(source.id, provider, message)
        }
        await jobs.fail(job.id, message)
        failures.push(`${source.id}: ${message}`)
        console.error(`Failed ${source.id}: ${message}`)
      }
    }

    if (failures.length > 0) {
      throw new Error(`Registry sync completed with ${failures.length} failure(s).`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
