import { CANDIDATE_RISK_MODEL_VERSION, classifyCandidate } from './candidate-risk.js'
import type { PublicSourceCandidate, SourceAdapterOptions, SourceAggregationAdapter } from './types.js'

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/lwmxiaobei/dsh-plugins/main/catalog/plugins.json'

// Tauri's WebView can expose `crypto` without exposing `crypto.subtle` while
// an application is loading from its custom local origin. Metadata hashing is
// still required for the immutable candidate identity, so keep a tiny, local
// SHA-256 fallback instead of treating that platform quirk as a catalog error.
function sha256Fallback(value: string): string {
  const source = new TextEncoder().encode(value)
  const bitLength = source.length * 8
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const bytes = new Uint8Array(paddedLength)
  bytes.set(source)
  bytes[source.length] = 0x80
  new DataView(bytes.buffer).setUint32(paddedLength - 4, bitLength >>> 0, false)
  new DataView(bytes.buffer).setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false)
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])
  const rotateRight = (input: number, bits: number) => (input >>> bits) | (input << (32 - bits))
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Uint32Array(64)
    const view = new DataView(bytes.buffer, offset, 64)
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]!
      const right = words[index - 2]!
      words[index] = (words[index - 16]! + (rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)) + words[index - 7]! + (rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10))) >>> 0
    }
    let a = hash[0]!
    let b = hash[1]!
    let c = hash[2]!
    let d = hash[3]!
    let e = hash[4]!
    let f = hash[5]!
    let g = hash[6]!
    let h = hash[7]!
    for (let index = 0; index < 64; index += 1) {
      const first = (h + (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) + ((e & f) ^ (~e & g)) + constants[index]! + words[index]!) >>> 0
      const second = ((rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      h = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0
    }
    hash[0] = (hash[0]! + a) >>> 0; hash[1] = (hash[1]! + b) >>> 0; hash[2] = (hash[2]! + c) >>> 0; hash[3] = (hash[3]! + d) >>> 0
    hash[4] = (hash[4]! + e) >>> 0; hash[5] = (hash[5]! + f) >>> 0; hash[6] = (hash[6]! + g) >>> 0; hash[7] = (hash[7]! + h) >>> 0
  }
  return [...hash].map((word) => word.toString(16).padStart(8, '0')).join('')
}

interface CommunityCatalogPlugin {
  repository?: unknown
  url?: unknown
  description?: unknown
  defaultBranch?: unknown
  language?: unknown
  license?: unknown
  stars?: unknown
  archived?: unknown
  disabled?: unknown
  fork?: unknown
  template?: unknown
  updatedAt?: unknown
  commit?: unknown
  package?: {
    name?: unknown
    version?: unknown
    bundlePatch?: unknown
  }
}

interface CommunityCatalog {
  plugins?: unknown
}

export interface CommunityCatalogDiscoveryOptions extends SourceAdapterOptions {
  url?: string
  maxEntries?: number
}

/**
 * Imports a source-verified public DSH directory as a bounded seed set. It is
 * deliberately not a trust grant: every entry remains COLLECTED_UNVERIFIED,
 * is pinned to its listed Git commit, and is validated again after installation
 * before it can be enabled in the local DSH Profile.
 */
export class CommunityCatalogAdapter implements SourceAggregationAdapter {
  private readonly fetcher: typeof fetch
  private readonly clock: () => Date
  private readonly url: string
  private readonly maxEntries: number

  constructor(options: CommunityCatalogDiscoveryOptions = {}) {
    this.fetcher = options.fetch ?? fetch
    this.clock = options.clock ?? (() => new Date())
    this.url = options.url ?? DEFAULT_CATALOG_URL
    this.maxEntries = Math.min(500, Math.max(1, options.maxEntries ?? 200))
  }

  async discover(): Promise<PublicSourceCandidate[]> {
    const response = await this.fetcher(this.url, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Community catalog returned status ${response.status}.`)
    const payload = await response.json() as CommunityCatalog
    if (!Array.isArray(payload.plugins)) throw new Error('Community catalog format is invalid.')
    const candidates = await Promise.all(payload.plugins
      .filter((plugin): plugin is CommunityCatalogPlugin => Boolean(plugin && typeof plugin === 'object'))
      .filter((plugin) => this.isEligible(plugin))
      .slice(0, this.maxEntries)
      .map((plugin) => this.toCandidate(plugin)))
    return candidates.sort((left, right) => left.repository.localeCompare(right.repository))
  }

  private isEligible(plugin: CommunityCatalogPlugin): boolean {
    return !plugin.archived
      && !plugin.disabled
      && !plugin.fork
      && !plugin.template
      && typeof plugin.repository === 'string'
      && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(plugin.repository)
      && typeof plugin.url === 'string'
      && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(plugin.url)
      && typeof plugin.commit === 'string'
      && /^[a-f0-9]{40}$/i.test(plugin.commit)
      && typeof plugin.package?.name === 'string'
      && /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/.test(plugin.package.name)
      && typeof plugin.package?.version === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/.test(plugin.package.version)
      && typeof plugin.package?.bundlePatch === 'string'
      && this.safePatch(plugin.package.bundlePatch) !== null
  }

  private async toCandidate(plugin: CommunityCatalogPlugin): Promise<PublicSourceCandidate> {
    const repository = plugin.repository as string
    const packageName = plugin.package?.name as string
    const version = plugin.package?.version as string
    const commit = (plugin.commit as string).toLowerCase()
    const patch = this.safePatch(plugin.package?.bundlePatch as string)!
    const discoveredAt = this.clock().toISOString()
    const description = typeof plugin.description === 'string' ? plugin.description : ''
    const assessment = classifyCandidate({
      name: packageName,
      description,
      readme: null,
      topics: ['dsh-plugin', 'catalog-source-verified'],
      packageManifest: { name: packageName, version, dsh: { bundle: { patch } } },
      hasFixedVersion: true,
      hasIntegrity: true,
      hasCommit: true,
      hasLicense: typeof plugin.license === 'string' && plugin.license !== 'NOASSERTION',
    })
    const canonical = JSON.stringify({ repository: repository.toLowerCase(), packageName, version, commit, patch })
    return {
      provider: 'github',
      external_id: `community:${repository.toLowerCase()}`,
      repository,
      repository_url: plugin.url as string,
      bundle_directory: null,
      author: repository.split('/')[0]!,
      description,
      default_branch: typeof plugin.defaultBranch === 'string' ? plugin.defaultBranch : 'main',
      name: packageName,
      readme_excerpt: null,
      license_spdx: typeof plugin.license === 'string' ? plugin.license : null,
      stars: typeof plugin.stars === 'number' && Number.isFinite(plugin.stars) ? Math.max(0, Math.floor(plugin.stars)) : 0,
      upstream_updated_at: typeof plugin.updatedAt === 'string' && !Number.isNaN(Date.parse(plugin.updatedAt))
        ? new Date(plugin.updatedAt).toISOString()
        : discoveredAt,
      version,
      commit_sha: commit,
      package_name: packageName,
      // Git is immutable enough for this distribution path only when the exact
      // commit is present. The installer turns it into a git+https spec and
      // validates the installed package manifest before enabling it.
      package_integrity: `git-commit:${commit}`,
      dsh_bundle_patch: patch,
      dsh_compatibility: 'unknown',
      category: assessment.category,
      permissions: assessment.permissions,
      risk_level: assessment.riskLevel,
      risk_reasons: [...assessment.reasons, 'COMMUNITY_CATALOG_SOURCE'],
      risk_assessed_at: discoveredAt,
      risk_model_version: CANDIDATE_RISK_MODEL_VERSION,
      metadata_sha256: await this.sha256(canonical),
      discovered_at: discoveredAt,
      status: 'COLLECTED_UNVERIFIED',
      retry_count: 0,
      last_error: null,
    }
  }

  private safePatch(value: string): string | null {
    const normalized = value.replace(/^\.\//, '')
    if (!normalized || normalized.length > 240 || normalized.includes('\\') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) return null
    return `./${normalized}`
  }

  private async sha256(value: string): Promise<string> {
    try {
      if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      }
    } catch {
      // Use the deterministic local implementation below.
    }
    return sha256Fallback(value)
  }
}
