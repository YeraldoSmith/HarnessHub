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
  readme_excerpt: z.string().max(4000).nullable().default(null),
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
    category: z.string().trim().min(1).max(60).optional(),
    sort: z.enum(['name', 'recent']).default('name'),
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

export const authUserSchema = z.object({
  id: z.string().uuid(),
  public_id: z.string().regex(/^HH-\d{10}$/),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'DELETED']),
  github: z.object({
    user_id: z.string().regex(/^\d+$/),
    login: z.string().max(80).nullable(),
    avatar_url: z.string().url().nullable(),
  }),
  roles: z.array(z.enum(['FOUNDER', 'ADMIN', 'MODERATOR', 'REVIEWER', 'DEVELOPER', 'USER'])),
  badges: z.array(z.enum([
    'FOUNDER',
    'OFFICIAL',
    'VERIFIED_DEVELOPER',
    'MODERATOR',
    'REVIEWER',
    'EARLY_USER',
    'BETA_TESTER',
  ])),
})

const localizedTextSchema = z.record(
  z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  z.string().trim().min(1).max(2000),
)

export const remoteConfigSchema = z.object({
  schema_version: z.literal(1),
  features: z.object({
    github_login: z.boolean(),
    announcements: z.boolean(),
  }).strict(),
  services: z.object({
    api_url: z.string().trim().max(500),
    announcements_url: z.string().trim().max(500),
  }).strict(),
  ui: z.object({
    notice: z.string().trim().max(500),
  }).strict(),
}).strict()

export const announcementSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  title: localizedTextSchema,
  body: localizedTextSchema,
  severity: z.enum(['INFO', 'UPDATE', 'SECURITY', 'MAINTENANCE']),
  published_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }).nullable(),
}).strict()

export const announcementListSchema = z.array(announcementSchema).max(50)

export const authenticatedSessionSchema = z.object({
  authenticated: z.literal(true),
  user: authUserSchema,
  expires_at: z.string().datetime({ offset: true }),
})

export const authSessionResponseSchema = z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(false) }),
  authenticatedSessionSchema,
])

export const desktopOAuthStartResponseSchema = z.object({
  authorization_url: z.string().url(),
  transaction_id: z.string().uuid(),
  poll_token: z.string().min(32).max(128),
  expires_at: z.string().datetime({ offset: true }),
})

export const desktopSessionExchangeResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('PENDING') }),
  z.object({
    status: z.literal('COMPLETE'),
    session_token: z.string().min(32).max(128),
    session: authenticatedSessionSchema,
  }),
])

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'Website must use HTTPS.')

export const developerProfileUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80),
    bio: z.string().trim().max(500).nullable().optional(),
    website: httpsUrlSchema.nullable().optional(),
  })
  .strict()

export const developerProfileSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  display_name: z.string().min(1).max(80),
  bio: z.string().max(500).nullable(),
  website: httpsUrlSchema.nullable(),
  verification_status: z.enum(['UNVERIFIED', 'VERIFIED', 'RESTRICTED']),
  verified_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})

export const developerClaimStartSchema = z
  .object({ plugin_id: pluginIdSchema })
  .strict()

export const developerClaimIdSchema = z.string().uuid()

export const developerClaimSchema = z.object({
  id: developerClaimIdSchema,
  plugin_id: pluginIdSchema,
  status: z.enum(['PENDING', 'VERIFYING', 'APPROVED', 'REJECTED', 'CONFLICT', 'EXPIRED', 'CANCELLED']),
  repository_url: z.string().url(),
  source_ref: z.string().min(1).max(255),
  source_external_id: z.string().min(1).max(255),
  source_owner_type: z.enum(['USER', 'ORGANIZATION']),
  proof_type: z.literal('GITHUB_REPOSITORY_CHALLENGE'),
  challenge_path: z.string().min(1).max(255),
  challenge_expires_at: z.string().datetime({ offset: true }),
  verified_at: z.string().datetime({ offset: true }).nullable(),
  error_code: z.string().max(80).nullable(),
  created_at: z.string().datetime({ offset: true }),
})

export const pluginOwnershipSchema = z.object({
  id: z.string().uuid(),
  plugin_id: pluginIdSchema,
  user_id: z.string().uuid(),
  ownership_type: z.enum(['OWNER', 'MAINTAINER', 'TEAM_MEMBER', 'ORGANIZATION_DELEGATE']),
  verification_method: z.literal('GITHUB_REPOSITORY_CHALLENGE'),
  repository_external_id: z.string().min(1).max(255),
  source_owner_type: z.enum(['USER', 'ORGANIZATION']),
  verified_at: z.string().datetime({ offset: true }),
  revoked_at: z.string().datetime({ offset: true }).nullable(),
})

export const developerTrustSummarySchema = z.object({
  profile: developerProfileSchema.nullable(),
  claims: z.array(developerClaimSchema),
  ownerships: z.array(pluginOwnershipSchema),
})

export const developerClaimStartResponseSchema = z.object({
  claim: developerClaimSchema,
  challenge: z.object({
    path: z.string().min(1).max(255),
    content: z.string().min(1).max(1000),
    expires_at: z.string().datetime({ offset: true }),
    instructions: z.string().min(1).max(500),
  }),
})

export const developerClaimVerificationResponseSchema = z.object({
  claim: developerClaimSchema,
  ownership: pluginOwnershipSchema,
  badge: z.literal('VERIFIED_DEVELOPER'),
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
