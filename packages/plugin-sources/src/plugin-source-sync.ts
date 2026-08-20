import { pluginSchema } from '@harnesshub/plugin-schema'
import type { PluginSnapshot } from '@harnesshub/types'

import { GitHubSourceAdapter } from './github-adapter.js'
import { NpmSourceAdapter } from './npm-adapter.js'
import type { ManualPluginSource, SourceAdapterOptions } from './types.js'

export class PluginSourceSync {
  private readonly github: GitHubSourceAdapter
  private readonly npm: NpmSourceAdapter
  private readonly clock: () => Date

  constructor(options: SourceAdapterOptions = {}) {
    this.github = new GitHubSourceAdapter(options)
    this.npm = new NpmSourceAdapter(options)
    this.clock = options.clock ?? (() => new Date())
  }

  async createSnapshot(source: ManualPluginSource): Promise<PluginSnapshot> {
    const [github, npm] = await Promise.all([
      this.github.fetch(source.github.repository, source.github.ref),
      this.npm.fetch(source.npm.package_name, source.npm.version),
    ])

    const githubPackageName = github.package_manifest.name
    if (githubPackageName !== npm.package_name) {
      throw new Error(
        `Source mismatch: GitHub package '${String(githubPackageName)}' does not match npm '${npm.package_name}'.`,
      )
    }

    const expectedRepository = `https://github.com/${source.github.repository}`.toLowerCase()
    if (npm.repository_url?.toLowerCase() !== expectedRepository) {
      throw new Error(
        `Source mismatch: npm repository '${String(npm.repository_url)}' does not match '${expectedRepository}'.`,
      )
    }

    if (github.license_spdx && npm.license_spdx && github.license_spdx !== npm.license_spdx) {
      throw new Error(
        `Source mismatch: GitHub license '${github.license_spdx}' differs from npm '${npm.license_spdx}'.`,
      )
    }

    const checkedAt = this.clock().toISOString()
    const licenseSpdx = npm.license_spdx ?? github.license_spdx ?? 'NOASSERTION'
    const compatibility = npm.dsh_compatibility

    const plugin = pluginSchema.parse({
      id: source.id,
      name: source.display_name,
      description: npm.description || github.description || github.readme_excerpt,
      source: 'github+npm',
      github_url: github.repository_url,
      npm_url: npm.package_url,
      author: {
        name: github.owner,
        handle: github.owner,
      },
      version: npm.version,
      category: source.category,
      tags: source.tags,
      permissions: [],
      compatibility: {
        dsh: compatibility,
        status: compatibility === 'unknown' ? 'unknown' : 'declared',
      },
      license: {
        spdx: licenseSpdx,
        name: licenseSpdx,
        url:
          licenseSpdx === 'NOASSERTION'
            ? null
            : `https://spdx.org/licenses/${encodeURIComponent(licenseSpdx)}.html`,
      },
      source_commit: github.commit_sha,
      npm_version: npm.version,
      checked_at: checkedAt,
      source_evidence: [github.evidence, npm.evidence],
      source_status: [
        {
          provider: 'github',
          status: 'AVAILABLE',
          last_verified_at: github.evidence.fetched_at,
          unavailable_since: null,
          error: null,
        },
        {
          provider: 'npm',
          status: 'AVAILABLE',
          last_verified_at: npm.evidence.fetched_at,
          unavailable_since: null,
          error: null,
        },
      ],
      readme_excerpt: github.readme_excerpt,
      is_mock: false,
    })

    return { plugin, checked_at: checkedAt }
  }
}
