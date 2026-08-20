import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  pluginSchema,
  pluginSnapshotComparisonSchema,
  pluginSnapshotRecordSchema,
  registryResponseSchema,
  authSessionResponseSchema,
  desktopOAuthStartResponseSchema,
  desktopSessionExchangeResponseSchema,
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
    const result = registryResponseSchema.parse({
      items: [mockPlugin],
      total: 1,
      page: 1,
      hasNext: false,
    })
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

  it('validates server-derived identity and desktop session envelopes', () => {
    const session = authSessionResponseSchema.parse({
      authenticated: true,
      user: {
        id: 'a0fb0416-83b0-42a5-b368-00923c872b18',
        status: 'ACTIVE',
        github: { user_id: '120692294', login: 'renamed-founder', avatar_url: null },
        roles: ['FOUNDER', 'USER'],
        badges: ['FOUNDER'],
      },
      expires_at: '2026-08-27T00:00:00.000Z',
    })
    const started = desktopOAuthStartResponseSchema.parse({
      authorization_url: 'https://github.com/login/oauth/authorize?state=test',
      transaction_id: 'df91eab0-3ebf-4cd2-bda6-828502b3ba0a',
      poll_token: 'a'.repeat(43),
      expires_at: '2026-08-20T00:10:00.000Z',
    })
    const delivered = desktopSessionExchangeResponseSchema.parse({
      status: 'COMPLETE',
      session_token: 'b'.repeat(64),
      session,
    })

    expect(started.transaction_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(delivered.status).toBe('COMPLETE')
  })
})
