import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import type {
  Plugin,
  PluginSnapshotChange,
  PluginSnapshotComparison,
  PluginSnapshotRecord,
  RegistryResponse,
} from '@harnesshub/types'
import { pluginIdSchema, registryQuerySchema, snapshotIdSchema } from '@harnesshub/plugin-schema'

import { PLUGIN_REPOSITORY, type PluginRepository } from './plugin.repository.js'

@Injectable()
export class PluginService {
  constructor(@Inject(PLUGIN_REPOSITORY) private readonly repository: PluginRepository) {}

  async list(rawQuery: unknown = {}): Promise<RegistryResponse> {
    const parsed = registryQuerySchema.safeParse(rawQuery)
    if (!parsed.success) {
      throw new BadRequestException('Invalid pagination or search query.')
    }
    const { q, category, sort, page, limit } = parsed.data
    const result = await this.repository.list({ query: q, category, sort, page, limit })
    return {
      items: result.items,
      total: result.total,
      page,
      hasNext: page * limit < result.total,
    }
  }

  async getById(id: string): Promise<Plugin> {
    this.assertPluginId(id)
    const plugin = await this.repository.getById(id)
    if (!plugin) {
      throw new NotFoundException(`Plugin '${id}' was not found in the registry.`)
    }
    return plugin
  }

  async listSnapshots(pluginId: string): Promise<PluginSnapshotRecord[]> {
    this.assertPluginId(pluginId)
    await this.assertPluginExists(pluginId)
    return this.repository.listSnapshots(pluginId)
  }

  async compareSnapshots(
    pluginId: string,
    fromSnapshotId?: string,
    toSnapshotId?: string,
  ): Promise<PluginSnapshotComparison> {
    if (!fromSnapshotId || !toSnapshotId) {
      throw new BadRequestException("Both 'from' and 'to' snapshot IDs are required.")
    }
    this.assertPluginId(pluginId)
    if (!snapshotIdSchema.safeParse(fromSnapshotId).success || !snapshotIdSchema.safeParse(toSnapshotId).success) {
      throw new BadRequestException('Invalid snapshot ID.')
    }

    const [from, to] = await Promise.all([
      this.repository.getSnapshot(pluginId, fromSnapshotId),
      this.repository.getSnapshot(pluginId, toSnapshotId),
    ])
    if (!from || !to) {
      throw new NotFoundException(`One or both snapshots were not found for plugin '${pluginId}'.`)
    }

    const fields: Array<[PluginSnapshotChange['field'], string | null, string | null]> = [
      ['version', from.plugin.version, to.plugin.version],
      ['source_commit', from.plugin.source_commit, to.plugin.source_commit],
      ['npm_version', from.plugin.npm_version, to.plugin.npm_version],
      ['compatibility', this.compatibilityValue(from.plugin), this.compatibilityValue(to.plugin)],
      ['license', from.plugin.license.spdx, to.plugin.license.spdx],
      ['source', from.plugin.source, to.plugin.source],
    ]

    return {
      plugin_id: pluginId,
      from_snapshot_id: from.id,
      to_snapshot_id: to.id,
      changes: fields
        .filter(([, before, after]) => before !== after)
        .map(([field, before, after]) => ({ field, before, after })),
    }
  }

  private async assertPluginExists(pluginId: string): Promise<void> {
    if (!(await this.repository.getById(pluginId))) {
      throw new NotFoundException(`Plugin '${pluginId}' was not found in the registry.`)
    }
  }

  private compatibilityValue(plugin: Plugin): string {
    return `${plugin.compatibility.status}:${plugin.compatibility.dsh}`
  }

  private assertPluginId(id: string): void {
    if (!pluginIdSchema.safeParse(id).success) {
      throw new BadRequestException('Invalid plugin ID.')
    }
  }
}
