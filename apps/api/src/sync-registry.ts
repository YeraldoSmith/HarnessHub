import 'dotenv/config'

import { readFile } from 'node:fs/promises'

import { manualPluginSourceListSchema, PluginSourceSync } from '@harnesshub/plugin-sources'

import { PrismaService } from './database/prisma.service.js'
import { PrismaPluginRepository } from './registry/prisma-plugin.repository.js'

async function main() {
  const configUrl = new URL('../../../config/registry-sources.json', import.meta.url)
  const sources = manualPluginSourceListSchema.parse(JSON.parse(await readFile(configUrl, 'utf8')))
  const prisma = new PrismaService()
  const repository = new PrismaPluginRepository(prisma)
  const sourceSync = new PluginSourceSync()

  await prisma.$connect()
  try {
    const failures: string[] = []
    for (const source of sources) {
      try {
        const snapshot = await sourceSync.createSnapshot(source)
        const plugin = await repository.saveSnapshot(snapshot)
        console.log(
          `Synced ${plugin.name} ${plugin.version} at ${plugin.source_commit ?? 'no GitHub commit'}.`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
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
