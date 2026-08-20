import { fetchJson } from './http.js'
import type { NpmSourceResult, SourceAdapterOptions } from './types.js'

interface NpmPackageDocument {
  'dist-tags'?: { latest?: string }
  versions?: Record<string, NpmVersionDocument>
}

interface NpmVersionDocument extends Record<string, unknown> {
  name?: string
  version?: string
  description?: string
  license?: string
  repository?: { url?: string } | string
  peerDependencies?: Record<string, string>
  dsh?: unknown
  dist?: {
    integrity?: string
    shasum?: string
    tarball?: string
  }
}

export class NpmSourceAdapter {
  private readonly fetchImpl: typeof fetch
  private readonly clock: () => Date

  constructor(options: SourceAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch
    this.clock = options.clock ?? (() => new Date())
  }

  async fetch(packageName: string, requestedVersion?: string): Promise<NpmSourceResult> {
    this.assertPackageName(packageName)
    const encodedName = encodeURIComponent(packageName)
    const metadataUrl = `https://registry.npmjs.org/${encodedName}`
    const document = await fetchJson<NpmPackageDocument>(this.fetchImpl, metadataUrl, {
      Accept: 'application/json',
      'User-Agent': 'HarnessHub-Registry/0.1',
    })
    const version = requestedVersion ?? document['dist-tags']?.latest
    if (!version) throw new Error(`npm package '${packageName}' has no resolvable version.`)

    const manifest = document.versions?.[version]
    if (!manifest) throw new Error(`npm package '${packageName}' does not contain version '${version}'.`)
    if (manifest.name !== packageName || manifest.version !== version) {
      throw new Error(`npm metadata identity mismatch for '${packageName}@${version}'.`)
    }

    this.assertBundle(manifest, packageName)
    const integrity = manifest.dist?.integrity ?? manifest.dist?.shasum ?? null
    const repositoryUrl = this.normalizeRepositoryUrl(manifest.repository)
    const fetchedAt = this.clock().toISOString()
    const licenseSpdx = typeof manifest.license === 'string' ? manifest.license : null

    return {
      provider: 'npm',
      package_name: packageName,
      package_url: `https://www.npmjs.com/package/${packageName}/v/${version}`,
      version,
      description: typeof manifest.description === 'string' ? manifest.description : '',
      license_spdx: licenseSpdx,
      repository_url: repositoryUrl,
      dsh_compatibility: this.resolveDshCompatibility(manifest.peerDependencies),
      package_manifest: manifest,
      evidence: {
        provider: 'npm',
        url: manifest.dist?.tarball ?? `https://registry.npmjs.org/${encodedName}/${version}`,
        repository_url: repositoryUrl,
        package_name: packageName,
        fetched_at: fetchedAt,
        commit_sha: null,
        release_tag: null,
        npm_version: version,
        integrity,
        readme_sha256: null,
        license_spdx: licenseSpdx,
      },
    }
  }

  private assertPackageName(packageName: string): void {
    const valid = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(packageName)
    if (!valid) throw new Error(`Invalid npm package name '${packageName}'.`)
  }

  private assertBundle(manifest: NpmVersionDocument, packageName: string): void {
    const dsh = manifest.dsh
    const bundle = dsh && typeof dsh === 'object' ? (dsh as { bundle?: unknown }).bundle : undefined
    const patch = bundle && typeof bundle === 'object' ? (bundle as { patch?: unknown }).patch : undefined
    if (typeof patch !== 'string' || !patch.trim()) {
      throw new Error(`npm package '${packageName}' does not declare a valid dsh.bundle.patch.`)
    }
  }

  private normalizeRepositoryUrl(repository?: NpmVersionDocument['repository']): string | null {
    const value = typeof repository === 'string' ? repository : repository?.url
    if (!value) return null
    return value.replace(/^git\+/, '').replace(/\.git$/, '')
  }

  private resolveDshCompatibility(peerDependencies?: Record<string, string>): string {
    if (!peerDependencies) return 'unknown'
    const ranges = Object.entries(peerDependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
      .map(([, range]) => range)
    if (ranges.length === 0) return 'unknown'
    const counts = new Map<string, number>()
    for (const range of ranges) counts.set(range, (counts.get(range) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'
  }
}
