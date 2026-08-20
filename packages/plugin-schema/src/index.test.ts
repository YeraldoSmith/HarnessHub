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
  developerProfileUpdateSchema,
  developerClaimStartResponseSchema,
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

  it('keeps developer trust state server-controlled', () => {
    expect(
      developerProfileUpdateSchema.safeParse({
        display_name: 'Developer',
        verification_status: 'VERIFIED',
      }).success,
    ).toBe(false)
    expect(
      developerProfileUpdateSchema.safeParse({
        display_name: 'Developer',
        website: 'http://example.com',
      }).success,
    ).toBe(false)
  })

  it('validates a repository challenge response', () => {
    const response = developerClaimStartResponseSchema.parse({
      claim: {
        id: 'b65ef191-4bf0-47f4-815b-269f00752aa4',
        plugin_id: 'example-plugin',
        status: 'PENDING',
        repository_url: 'https://github.com/example/plugin',
        source_ref: 'main',
        source_external_id: '1234',
        source_owner_type: 'ORGANIZATION',
        proof_type: 'GITHUB_REPOSITORY_CHALLENGE',
        challenge_path: '.harnesshub/claims/b65ef191-4bf0-47f4-815b-269f00752aa4.txt',
        challenge_expires_at: '2026-08-21T00:00:00.000Z',
        verified_at: null,
        error_code: null,
        created_at: '2026-08-20T00:00:00.000Z',
      },
      challenge: {
        path: '.harnesshub/claims/b65ef191-4bf0-47f4-815b-269f00752aa4.txt',
        content: 'harnesshub-developer-claim-v1\nclaim_id=test\nnonce=test',
        expires_at: '2026-08-21T00:00:00.000Z',
        instructions: 'Commit this exact file to the default branch.',
      },
    })
    expect(response.claim.status).toBe('PENDING')
  })
})
