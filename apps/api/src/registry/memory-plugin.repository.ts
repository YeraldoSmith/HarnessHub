import type {
  Plugin,
  PluginPageSlice,
  PluginSnapshot,
  PluginSnapshotRecord,
  RegistryListQuery,
} from '@harnesshub/types'

import type { PluginRepository } from './plugin.repository.js'

export class MemoryPluginRepository implements PluginRepository {
  private readonly plugins = new Map<string, Plugin>()
  private readonly snapshots = new Map<string, PluginSnapshotRecord[]>()
  private sequence = 0

  constructor(initialPlugins: Plugin[] = []) {
    for (const plugin of initialPlugins) {
      this.plugins.set(plugin.id, structuredClone(plugin))
      this.appendSnapshot({ plugin, checked_at: plugin.checked_at })
    }
  }

  async list({ query, category, sort = 'name', page, limit }: RegistryListQuery): Promise<PluginPageSlice> {
    const normalizedQuery = query?.trim().toLocaleLowerCase()
    const plugins = [...this.plugins.values()]
    const categoryFiltered = category
      ? plugins.filter((plugin) => plugin.category.toLocaleLowerCase() === category.toLocaleLowerCase())
      : plugins
    const filtered = normalizedQuery
      ? categoryFiltered.filter((plugin) =>
          [
            plugin.name,
            plugin.description,
            plugin.author.name,
            plugin.author.handle,
            plugin.category,
            ...plugin.tags,
          ].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
      : categoryFiltered

    const sorted = filtered.sort((a, b) =>
      sort === 'recent'
        ? b.checked_at.localeCompare(a.checked_at) || a.id.localeCompare(b.id)
        : a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    )
    const start = (page - 1) * limit
    return {
      items: sorted.slice(start, start + limit).map((plugin) => structuredClone(plugin)),
      total: sorted.length,
    }
  }

  async getById(id: string): Promise<Plugin | null> {
    const plugin = this.plugins.get(id)
    return plugin ? structuredClone(plugin) : null
  }

  async listSnapshots(pluginId: string): Promise<PluginSnapshotRecord[]> {
    return structuredClone(this.snapshots.get(pluginId) ?? [])
  }

  async getSnapshot(pluginId: string, snapshotId: string): Promise<PluginSnapshotRecord | null> {
    const snapshot = this.snapshots.get(pluginId)?.find((record) => record.id === snapshotId)
    return snapshot ? structuredClone(snapshot) : null
  }

  async saveSnapshot(snapshot: PluginSnapshot): Promise<Plugin> {
    this.plugins.set(snapshot.plugin.id, structuredClone(snapshot.plugin))
    this.appendSnapshot(snapshot)
    return structuredClone(snapshot.plugin)
  }

  private appendSnapshot(snapshot: PluginSnapshot): void {
    this.sequence += 1
    const record: PluginSnapshotRecord = {
      ...structuredClone(snapshot),
      id: `memory-snapshot-${this.sequence}`,
      plugin_id: snapshot.plugin.id,
      plugin_version_id: `memory-version-${snapshot.plugin.id}-${snapshot.plugin.version}`,
    }
    const records = this.snapshots.get(snapshot.plugin.id) ?? []
    records.unshift(record)
    this.snapshots.set(snapshot.plugin.id, records)
  }
}
