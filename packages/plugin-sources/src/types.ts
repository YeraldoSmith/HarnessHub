import { z } from 'zod'

import type { SourceEvidence } from '@harnesshub/types'

export const manualPluginSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  display_name: z.string().min(1).max(80),
  category: z.string().min(1).max(60),
  github: z.object({
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    ref: z.string().min(1).max(200).optional(),
  }),
  npm: z.object({
    package_name: z.string().min(1).max(214),
    version: z.string().min(1).max(40).optional(),
  }),
})

export const manualPluginSourceListSchema = z.array(manualPluginSourceSchema).min(1)

export type ManualPluginSource = z.infer<typeof manualPluginSourceSchema>

export interface SourceAdapterOptions {
  fetch?: typeof fetch
  clock?: () => Date
}

export interface GitHubSourceResult {
  provider: 'github'
  repository: string
  repository_url: string
  owner: string
  description: string
  default_branch: string
  commit_sha: string
  release_tag: string | null
  license_spdx: string | null
  readme_excerpt: string
  package_manifest: Record<string, unknown>
  evidence: SourceEvidence
}

export interface NpmSourceResult {
  provider: 'npm'
  package_name: string
  package_url: string
  version: string
  description: string
  license_spdx: string | null
  repository_url: string | null
  dsh_compatibility: string
  package_manifest: Record<string, unknown>
  evidence: SourceEvidence
}
