import type { SyncJobRecord } from '@harnesshub/types'

export interface SyncJobRepository {
  create(pluginId: string, source: string): Promise<SyncJobRecord>
  start(id: string): Promise<SyncJobRecord>
  succeed(id: string): Promise<SyncJobRecord>
  fail(id: string, error: string): Promise<SyncJobRecord>
  list(pluginId?: string): Promise<SyncJobRecord[]>
}
