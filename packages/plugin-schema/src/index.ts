import { z } from 'zod'

import type { Plugin } from '@harnesshub/types'

export const permissionSchema = z.object({
  id: z.enum([
    'filesystem-read',
    'filesystem-write',
    'network',
    'subprocess',
    'credentials',
    'browser',
    'install-script',
    'telemetry',
  ]),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  risk: z.enum(['low', 'medium', 'high']),
})

export const pluginSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  source: z.enum(['mock', 'github', 'npm', 'github+npm']),
  github_url: z.string().url().nullable(),
  npm_url: z.string().url().nullable(),
  author: z.object({
    name: z.string().min(1).max(80),
    handle: z.string().min(1).max(80),
  }),
  version: z.string().min(1).max(40),
  category: z.string().min(1).max(60),
  tags: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(20).default([]),
  permissions: z.array(permissionSchema).max(20),
  compatibility: z.object({
    dsh: z.string().min(1).max(80),
    status: z.enum(['mock', 'declared', 'tested', 'unknown']),
  }),
  license: z.object({
    spdx: z.string().min(1).max(40),
    name: z.string().min(1).max(100),
    url: z.string().url().nullable(),
  }),
  source_commit: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  npm_version: z.string().min(1).max(40).nullable(),
  checked_at: z.string().datetime({ offset: true }),
  source_evidence: z.array(
    z.object({
      provider: z.enum(['github', 'npm']),
      url: z.string().url(),
      repository_url: z.string().url().nullable(),
      package_name: z.string().max(214).nullable(),
      fetched_at: z.string().datetime({ offset: true }),
      commit_sha: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
      release_tag: z.string().max(200).nullable(),
      npm_version: z.string().max(40).nullable(),
      integrity: z.string().max(300).nullable(),
      readme_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
      license_spdx: z.string().max(80).nullable(),
    }),
  ),
  source_status: z
    .array(
      z.object({
        provider: z.enum(['github', 'npm']),
        status: z.enum(['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE']),
        last_verified_at: z.string().datetime({ offset: true }).nullable(),
        unavailable_since: z.string().datetime({ offset: true }).nullable(),
        error: z.string().max(500).nullable(),
      }),
    )
    .max(2)
    .default([]),
  is_mock: z.boolean(),
}) satisfies z.ZodType<Plugin>

export const pluginListSchema = z.array(pluginSchema)
export const pluginIdSchema = pluginSchema.shape.id
export const snapshotIdSchema = z.string().regex(/^[a-z0-9-]+$/).min(1).max(40)

export const registryResponseSchema = z.object({
  items: pluginListSchema,
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  hasNext: z.boolean(),
})

export const registryQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()

export const syncJobSchema = z.object({
  id: z.string().min(1).max(40),
  plugin_id: pluginSchema.shape.id,
  source: z.string().min(1).max(40),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED']),
  started_at: z.string().datetime({ offset: true }).nullable(),
  finished_at: z.string().datetime({ offset: true }).nullable(),
  error: z.string().max(2000).nullable(),
  created_at: z.string().datetime({ offset: true }),
})

export const pluginSnapshotSchema = z.object({
  plugin: pluginSchema,
  checked_at: z.string().datetime({ offset: true }),
})

export const pluginSnapshotRecordSchema = pluginSnapshotSchema.extend({
  id: z.string().min(1).max(40),
  plugin_id: pluginSchema.shape.id,
  plugin_version_id: z.string().min(1).max(40),
})

export const pluginSnapshotListSchema = z.array(pluginSnapshotRecordSchema)

export const pluginSnapshotChangeSchema = z.object({
  field: z.enum(['version', 'source_commit', 'npm_version', 'compatibility', 'license', 'source']),
  before: z.string().nullable(),
  after: z.string().nullable(),
})

export const pluginSnapshotComparisonSchema = z.object({
  plugin_id: pluginSchema.shape.id,
  from_snapshot_id: z.string().min(1).max(40),
  to_snapshot_id: z.string().min(1).max(40),
  changes: z.array(pluginSnapshotChangeSchema),
})

export type {
  Plugin,
  PluginSnapshot,
  PluginSnapshotChange,
  PluginSnapshotComparison,
  PluginSnapshotRecord,
  SourceEvidence,
} from '@harnesshub/types'
