import type { Plugin, PluginSnapshot } from '@harnesshub/types'

import type { PluginRepository } from './plugin.repository.js'

export class MemoryPluginRepository implements PluginRepository {
  private readonly plugins = new Map<string, Plugin>()

  constructor(initialPlugins: Plugin[] = []) {
    for (const plugin of initialPlugins) this.plugins.set(plugin.id, structuredClone(plugin))
  }

  async list(query?: string): Promise<Plugin[]> {
    const normalizedQuery = query?.trim().toLocaleLowerCase()
    const plugins = [...this.plugins.values()]
    const filtered = normalizedQuery
      ? plugins.filter((plugin) =>
          [plugin.name, plugin.description, plugin.author.name, plugin.category].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
        )
      : plugins

    return filtered.sort((a, b) => a.name.localeCompare(b.name)).map((plugin) => structuredClone(plugin))
  }

  async getById(id: string): Promise<Plugin | null> {
    const plugin = this.plugins.get(id)
    return plugin ? structuredClone(plugin) : null
  }

  async saveSnapshot(snapshot: PluginSnapshot): Promise<Plugin> {
    this.plugins.set(snapshot.plugin.id, structuredClone(snapshot.plugin))
    return structuredClone(snapshot.plugin)
  }
}
