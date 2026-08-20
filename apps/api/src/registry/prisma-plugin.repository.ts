import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import { pluginSchema } from '@harnesshub/plugin-schema'
import type {
  Plugin,
  PluginSnapshot,
  PluginSnapshotRecord,
  SourceEvidence,
} from '@harnesshub/types'

import { Prisma, SourceProvider, SourceType } from '../generated/prisma/client.js'
import { PrismaService } from '../database/prisma.service.js'
import type { PluginRepository } from './plugin.repository.js'

@Injectable()
export class PrismaPluginRepository implements PluginRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query?: string): Promise<Plugin[]> {
    const normalizedQuery = query?.trim().toLocaleLowerCase()
    const records = await this.prisma.plugin.findMany({
      orderBy: { name: 'asc' },
      include: this.latestSnapshotInclude(),
    })

    const plugins = records.flatMap((record) => {
      const snapshot = record.versions[0]?.snapshots[0]
      return snapshot ? [pluginSchema.parse(snapshot.data)] : []
    })

    return normalizedQuery
      ? plugins.filter((plugin) =>
          [plugin.name, plugin.description, plugin.author.name, plugin.category].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
      : plugins
  }

  async getById(id: string): Promise<Plugin | null> {
    const record = await this.prisma.plugin.findUnique({
      where: { id },
      include: this.latestSnapshotInclude(),
    })
    const snapshot = record?.versions[0]?.snapshots[0]
    return snapshot ? pluginSchema.parse(snapshot.data) : null
  }

  async listSnapshots(pluginId: string): Promise<PluginSnapshotRecord[]> {
    const snapshots = await this.prisma.pluginSnapshot.findMany({
      where: { pluginVersion: { pluginId } },
      orderBy: [{ checkedAt: 'desc' }, { createdAt: 'desc' }],
      include: { pluginVersion: { select: { pluginId: true } } },
    })

    return snapshots.map((snapshot) => this.toSnapshotRecord(snapshot))
  }

  async getSnapshot(pluginId: string, snapshotId: string): Promise<PluginSnapshotRecord | null> {
    const snapshot = await this.prisma.pluginSnapshot.findFirst({
      where: { id: snapshotId, pluginVersion: { pluginId } },
      include: { pluginVersion: { select: { pluginId: true } } },
    })

    return snapshot ? this.toSnapshotRecord(snapshot) : null
  }

  async saveSnapshot(snapshot: PluginSnapshot): Promise<Plugin> {
    const plugin = pluginSchema.parse(snapshot.plugin)
    if (plugin.is_mock) {
      throw new Error('Mock plugins cannot be written to the production Registry.')
    }

    const identityKey = createHash('sha256')
      .update([plugin.id, plugin.version, plugin.source_commit ?? '', plugin.npm_version ?? ''].join('|'))
      .digest('hex')

    await this.prisma.$transaction(async (tx) => {
      await tx.plugin.upsert({
        where: { id: plugin.id },
        create: {
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
          category: plugin.category,
          license: plugin.license.spdx,
          sourceType: this.toSourceType(plugin.source),
        },
        update: {
          name: plugin.name,
          description: plugin.description,
          category: plugin.category,
          license: plugin.license.spdx,
          sourceType: this.toSourceType(plugin.source),
        },
      })

      for (const evidence of plugin.source_evidence) {
        await tx.pluginSource.upsert({
          where: {
            pluginId_provider: {
              pluginId: plugin.id,
              provider: this.toSourceProvider(evidence),
            },
          },
          create: {
            pluginId: plugin.id,
            provider: this.toSourceProvider(evidence),
            repositoryUrl: evidence.repository_url,
            packageName: evidence.package_name,
            evidence: this.toJson(evidence),
          },
          update: {
            repositoryUrl: evidence.repository_url,
            packageName: evidence.package_name,
            evidence: this.toJson(evidence),
          },
        })
      }

      let version = await tx.pluginVersion.findUnique({ where: { identityKey } })
      if (!version) {
        version = await tx.pluginVersion.create({
          data: {
            pluginId: plugin.id,
            version: plugin.version,
            sourceCommit: plugin.source_commit,
            npmVersion: plugin.npm_version,
            compatibility: this.toJson(plugin.compatibility),
            identityKey,
          },
        })
      } else if (version.pluginId !== plugin.id) {
        throw new Error(`Version identity collision for '${plugin.id}'.`)
      }

      await tx.pluginSnapshot.create({
        data: {
          pluginVersionId: version.id,
          checkedAt: new Date(snapshot.checked_at),
          source: plugin.source,
          data: this.toJson(plugin),
          evidence: this.toJson(plugin.source_evidence),
        },
      })
    })

    return plugin
  }

  private latestSnapshotInclude() {
    return {
      versions: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        include: {
          snapshots: {
            orderBy: { checkedAt: 'desc' as const },
            take: 1,
          },
        },
      },
    }
  }

  private toSnapshotRecord(snapshot: {
    id: string
    pluginVersionId: string
    checkedAt: Date
    data: Prisma.JsonValue
    pluginVersion: { pluginId: string }
  }): PluginSnapshotRecord {
    return {
      id: snapshot.id,
      plugin_id: snapshot.pluginVersion.pluginId,
      plugin_version_id: snapshot.pluginVersionId,
      plugin: pluginSchema.parse(snapshot.data),
      checked_at: snapshot.checkedAt.toISOString(),
    }
  }

  private toSourceType(source: Plugin['source']): SourceType {
    if (source === 'github') return SourceType.GITHUB
    if (source === 'npm') return SourceType.NPM
    if (source === 'github+npm') return SourceType.GITHUB_NPM
    throw new Error(`Unsupported production source '${source}'.`)
  }

  private toSourceProvider(evidence: SourceEvidence): SourceProvider {
    return evidence.provider === 'github' ? SourceProvider.GITHUB : SourceProvider.NPM
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue
  }
}
