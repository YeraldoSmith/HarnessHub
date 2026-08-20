import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import { pluginSchema } from '@harnesshub/plugin-schema'
import type {
  Plugin,
  PluginPageSlice,
  PluginSnapshot,
  PluginSnapshotRecord,
  PluginSourceStatus,
  RegistryListQuery,
  SourceEvidence,
} from '@harnesshub/types'

import {
  Prisma,
  SourceAvailability,
  SourceProvider,
  SourceType,
} from '../generated/prisma/client.js'
import { PrismaService } from '../database/prisma.service.js'
import type { PluginRepository } from './plugin.repository.js'

@Injectable()
export class PrismaPluginRepository implements PluginRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list({ query, page, limit }: RegistryListQuery): Promise<PluginPageSlice> {
    const normalizedQuery = query?.trim().toLocaleLowerCase()
    const where: Prisma.PluginWhereInput | undefined = normalizedQuery
      ? {
          OR: [
            { name: { contains: normalizedQuery, mode: 'insensitive' } },
            { description: { contains: normalizedQuery, mode: 'insensitive' } },
            { category: { contains: normalizedQuery, mode: 'insensitive' } },
            { authorName: { contains: normalizedQuery, mode: 'insensitive' } },
            { authorHandle: { contains: normalizedQuery, mode: 'insensitive' } },
            { tags: { has: normalizedQuery } },
          ],
        }
      : undefined
    const [total, records] = await this.prisma.$transaction([
      this.prisma.plugin.count({ where }),
      this.prisma.plugin.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: this.latestSnapshotInclude(),
      }),
    ])

    return {
      items: records.flatMap((record) => {
        const snapshot = record.versions[0]?.snapshots[0]
        return snapshot
          ? [this.withCurrentSourceStatus(snapshot.data, record.tags, record.sources)]
          : []
      }),
      total,
    }
  }

  async getById(id: string): Promise<Plugin | null> {
    const record = await this.prisma.plugin.findUnique({
      where: { id },
      include: this.latestSnapshotInclude(),
    })
    const snapshot = record?.versions[0]?.snapshots[0]
    return snapshot
      ? this.withCurrentSourceStatus(snapshot.data, record.tags, record.sources)
      : null
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
          authorName: plugin.author.name,
          authorHandle: plugin.author.handle,
          tags: plugin.tags,
          license: plugin.license.spdx,
          sourceType: this.toSourceType(plugin.source),
        },
        update: {
          name: plugin.name,
          description: plugin.description,
          category: plugin.category,
          authorName: plugin.author.name,
          authorHandle: plugin.author.handle,
          tags: plugin.tags,
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
            status: SourceAvailability.AVAILABLE,
            lastVerifiedAt: new Date(evidence.fetched_at),
            unavailableSince: null,
            lastError: null,
          },
          update: {
            repositoryUrl: evidence.repository_url,
            packageName: evidence.package_name,
            evidence: this.toJson(evidence),
            status: SourceAvailability.AVAILABLE,
            lastVerifiedAt: new Date(evidence.fetched_at),
            unavailableSince: null,
            lastError: null,
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

  async markSourceUnavailable(
    pluginId: string,
    provider: SourceEvidence['provider'],
    error: string,
    checkedAt = new Date(),
  ): Promise<number> {
    const result = await this.prisma.pluginSource.updateMany({
      where: { pluginId, provider: provider === 'github' ? SourceProvider.GITHUB : SourceProvider.NPM },
      data: {
        status: SourceAvailability.UNAVAILABLE,
        unavailableSince: checkedAt,
        lastError: error.slice(0, 500),
      },
    })
    return result.count
  }

  private latestSnapshotInclude() {
    return {
      sources: {
        orderBy: { provider: 'asc' as const },
      },
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

  private withCurrentSourceStatus(
    data: Prisma.JsonValue,
    tags: string[],
    sources: Array<{
      provider: SourceProvider
      status: SourceAvailability
      lastVerifiedAt: Date | null
      unavailableSince: Date | null
      lastError: string | null
    }>,
  ): Plugin {
    const plugin = pluginSchema.parse(data)
    return pluginSchema.parse({
      ...plugin,
      tags,
      source_status: sources.map((source): PluginSourceStatus => ({
        provider: source.provider === SourceProvider.GITHUB ? 'github' : 'npm',
        status: source.status,
        last_verified_at: source.lastVerifiedAt?.toISOString() ?? null,
        unavailable_since: source.unavailableSince?.toISOString() ?? null,
        error: source.lastError,
      })),
    })
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
