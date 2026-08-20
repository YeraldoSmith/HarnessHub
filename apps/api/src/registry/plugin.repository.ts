import type {
  Plugin,
  PluginPageSlice,
  PluginSnapshot,
  PluginSnapshotRecord,
  RegistryListQuery,
} from '@harnesshub/types'

export const PLUGIN_REPOSITORY = Symbol('PLUGIN_REPOSITORY')

export interface PluginRepository {
  list(query: RegistryListQuery): Promise<PluginPageSlice>
  getById(id: string): Promise<Plugin | null>
  listSnapshots(pluginId: string): Promise<PluginSnapshotRecord[]>
  getSnapshot(pluginId: string, snapshotId: string): Promise<PluginSnapshotRecord | null>
  saveSnapshot(snapshot: PluginSnapshot): Promise<Plugin>
}
