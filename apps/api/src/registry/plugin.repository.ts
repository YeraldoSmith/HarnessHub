import type { Plugin, PluginSnapshot, PluginSnapshotRecord } from '@harnesshub/types'

export const PLUGIN_REPOSITORY = Symbol('PLUGIN_REPOSITORY')

export interface PluginRepository {
  list(query?: string): Promise<Plugin[]>
  getById(id: string): Promise<Plugin | null>
  listSnapshots(pluginId: string): Promise<PluginSnapshotRecord[]>
  getSnapshot(pluginId: string, snapshotId: string): Promise<PluginSnapshotRecord | null>
  saveSnapshot(snapshot: PluginSnapshot): Promise<Plugin>
}
