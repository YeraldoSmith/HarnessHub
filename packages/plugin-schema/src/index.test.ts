import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  pluginSchema,
  pluginSnapshotComparisonSchema,
  pluginSnapshotRecordSchema,
  registryResponseSchema,
} from './index.js'

const mockPlugin = pluginSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../tests/fixtures/mock-plugin.json', import.meta.url), 'utf8'),
  ),
)

describe('plugin schema', () => {
  it('accepts the Phase 1 mock plugin', () => {
    expect(pluginSchema.parse(mockPlugin)).toEqual(mockPlugin)
  })

  it('rejects an unknown permission', () => {
    const result = pluginSchema.safeParse({
      ...mockPlugin,
      permissions: [
        {
          id: 'unbounded-root-access',
          label: 'Unknown',
          description: 'Not part of the permission vocabulary.',
          risk: 'high',
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('validates registry envelopes', () => {
    const result = registryResponseSchema.parse({ data: [mockPlugin], total: 1 })
    expect(result.total).toBe(1)
  })

  it('validates snapshot history and comparison envelopes', () => {
    const snapshot = pluginSnapshotRecordSchema.parse({
      id: 'snapshot-1',
      plugin_id: mockPlugin.id,
      plugin_version_id: 'version-1',
      plugin: mockPlugin,
      checked_at: mockPlugin.checked_at,
    })
    const comparison = pluginSnapshotComparisonSchema.parse({
      plugin_id: mockPlugin.id,
      from_snapshot_id: snapshot.id,
      to_snapshot_id: 'snapshot-2',
      changes: [{ field: 'version', before: '0.1.0', after: '0.2.0' }],
    })

    expect(comparison.changes[0]?.field).toBe('version')
  })
})
