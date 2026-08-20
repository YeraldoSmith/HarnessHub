import type { Plugin, PluginSnapshot } from '@harnesshub/types'

export const PLUGIN_REPOSITORY = Symbol('PLUGIN_REPOSITORY')

export interface PluginRepository {
  list(query?: string): Promise<Plugin[]>
  getById(id: string): Promise<Plugin | null>
  saveSnapshot(snapshot: PluginSnapshot): Promise<Plugin>
}
