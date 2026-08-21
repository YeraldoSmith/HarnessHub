import { Inject, Injectable } from '@nestjs/common'

import type { PublicSourceCandidate } from '@harnesshub/plugin-sources'
import type { CandidatePlugin } from '@harnesshub/types'

import { CandidatePluginStatus, PluginRiskLevel, Prisma, SourceProvider } from '../generated/prisma/client.js'
import { PrismaService } from '../database/prisma.service.js'
import type { CandidatePluginRepository } from './candidate-plugin.repository.js'

@Injectable()
export class PrismaCandidatePluginRepository implements CandidatePluginRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query = '', limit = 100): Promise<{ items: CandidatePlugin[]; total: number }> {
    const normalized = query.trim()
    const where: Prisma.CandidatePluginWhereInput = normalized ? {
      active: true,
      OR: [
        { name: { contains: normalized, mode: 'insensitive' } },
        { description: { contains: normalized, mode: 'insensitive' } },
        { owner: { contains: normalized, mode: 'insensitive' } },
        { repository: { contains: normalized, mode: 'insensitive' } },
        { packageName: { contains: normalized, mode: 'insensitive' } },
      ],
    } : { active: true }
    const [records, total] = await this.prisma.$transaction([
      this.prisma.candidatePlugin.findMany({
        where,
        take: Math.min(1_000, Math.max(1, limit)),
        orderBy: [{ upstreamUpdatedAt: 'desc' }, { canonicalKey: 'asc' }],
      }),
      this.prisma.candidatePlugin.count({ where }),
    ])
    return { items: records.map((record) => this.toCandidate(record)), total }
  }

  async upsertMany(candidates: PublicSourceCandidate[]): Promise<number> {
    if (candidates.length === 0) return 0
    const publishedSources = await this.prisma.pluginSource.findMany({
      where: { provider: SourceProvider.GITHUB, repositoryUrl: { not: null } },
      select: { repositoryUrl: true, packageName: true },
    })
    const published = new Set(publishedSources.flatMap(({ repositoryUrl, packageName }) => {
      if (!repositoryUrl) return []
      try {
        const url = new URL(repositoryUrl)
        const repository = url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '').toLowerCase()
        return [`${repository}#${packageName ?? ''}`]
      } catch { return [] }
    }))
    const deduplicated = new Map<string, PublicSourceCandidate>()
    for (const candidate of candidates) {
      const key = candidateCanonicalKey(candidate)
      const publishedKey = `${candidate.repository.toLowerCase()}#${candidate.package_name ?? ''}`
      if (!published.has(publishedKey)) deduplicated.set(key, candidate)
    }
    const keys = [...deduplicated.keys()]
    const existingRecords = keys.length > 0
      ? await this.prisma.candidatePlugin.findMany({
        where: { canonicalKey: { in: keys } },
        select: { canonicalKey: true, metadataSha256: true },
      })
      : []
    const existingHashes = new Map(existingRecords.map((record) => [record.canonicalKey, record.metadataSha256]))
    await this.prisma.$transaction([
      this.prisma.candidatePlugin.updateMany({ data: { active: false } }),
      ...[...deduplicated.entries()].map(([canonicalKey, candidate]) => this.prisma.candidatePlugin.upsert({
        where: { canonicalKey },
        create: {
          ...this.data(candidate, canonicalKey),
          snapshots: { create: this.snapshotData(candidate) },
        },
        update: {
          ...this.data(candidate, canonicalKey),
          discoveredAt: undefined,
          ...(existingHashes.get(canonicalKey) !== candidate.metadata_sha256
            ? { snapshots: { create: this.snapshotData(candidate) } }
            : {}),
        },
      })),
    ])
    return deduplicated.size
  }

  async latestObservedAt(): Promise<Date | null> {
    const record = await this.prisma.candidatePlugin.findFirst({
      orderBy: { lastObservedAt: 'desc' },
      select: { lastObservedAt: true },
    })
    return record?.lastObservedAt ?? null
  }

  private data(candidate: PublicSourceCandidate, canonicalKey: string) {
    return {
      provider: SourceProvider.GITHUB,
      externalId: candidate.external_id,
      canonicalKey,
      repository: candidate.repository,
      repositoryUrl: candidate.repository_url,
      owner: candidate.author,
      name: candidate.name,
      description: candidate.description,
      defaultBranch: candidate.default_branch,
      readmeExcerpt: candidate.readme_excerpt,
      licenseSpdx: candidate.license_spdx,
      stars: candidate.stars,
      upstreamUpdatedAt: new Date(candidate.upstream_updated_at),
      commitSha: candidate.commit_sha,
      packageName: candidate.package_name,
      packageVersion: candidate.version,
      packageIntegrity: candidate.package_integrity,
      dshCompatibility: candidate.dsh_compatibility,
      category: candidate.category,
      permissions: candidate.permissions as unknown as Prisma.InputJsonValue,
      riskLevel: PluginRiskLevel[candidate.risk_level],
      riskReasons: candidate.risk_reasons as unknown as Prisma.InputJsonValue,
      riskAssessedAt: new Date(candidate.risk_assessed_at),
      riskModelVersion: candidate.risk_model_version,
      metadataSha256: candidate.metadata_sha256,
      sourceMetadata: candidate as unknown as Prisma.InputJsonValue,
      status: CandidatePluginStatus.COLLECTED_UNVERIFIED,
      active: true,
      retryCount: candidate.retry_count,
      lastError: candidate.last_error,
      discoveredAt: new Date(candidate.discovered_at),
      lastObservedAt: new Date(candidate.discovered_at),
    }
  }

  private snapshotData(candidate: PublicSourceCandidate) {
    return {
      metadataSha256: candidate.metadata_sha256,
      category: candidate.category,
      riskLevel: PluginRiskLevel[candidate.risk_level],
      riskReasons: candidate.risk_reasons as unknown as Prisma.InputJsonValue,
      permissions: candidate.permissions as unknown as Prisma.InputJsonValue,
      sourceMetadata: candidate as unknown as Prisma.InputJsonValue,
      evidence: {
        github: {
          url: candidate.repository_url,
          commit: candidate.commit_sha,
          fetched_at: candidate.discovered_at,
        },
        npm: candidate.package_name ? {
          package: candidate.package_name,
          version: candidate.version,
          integrity: candidate.package_integrity,
        } : null,
      } as Prisma.InputJsonValue,
      observedAt: new Date(candidate.discovered_at),
    }
  }

  private toCandidate(record: {
    id: string; externalId: string; repository: string; repositoryUrl: string; owner: string; name: string
    description: string; defaultBranch: string; readmeExcerpt: string | null; licenseSpdx: string | null
    stars: number; upstreamUpdatedAt: Date; commitSha: string | null; packageName: string | null
    packageVersion: string | null; packageIntegrity: string | null; dshCompatibility: string | null
    category: string; permissions: Prisma.JsonValue; riskLevel: PluginRiskLevel; riskReasons: Prisma.JsonValue
    riskAssessedAt: Date; riskModelVersion: string; metadataSha256: string; discoveredAt: Date
    lastObservedAt: Date; retryCount: number; lastError: string | null; sourceMetadata: Prisma.JsonValue
  }): CandidatePlugin {
    const sourceMetadata = record.sourceMetadata && typeof record.sourceMetadata === 'object' && !Array.isArray(record.sourceMetadata)
      ? record.sourceMetadata as Record<string, unknown>
      : {}
    return {
      id: record.id,
      provider: 'github',
      external_id: record.externalId,
      repository: record.repository,
      repository_url: record.repositoryUrl,
      bundle_directory: typeof sourceMetadata.bundle_directory === 'string' ? sourceMetadata.bundle_directory : null,
      owner: record.owner,
      name: record.name,
      description: record.description,
      default_branch: record.defaultBranch,
      readme_excerpt: record.readmeExcerpt,
      license_spdx: record.licenseSpdx,
      stars: record.stars,
      upstream_updated_at: record.upstreamUpdatedAt.toISOString(),
      commit_sha: record.commitSha,
      package_name: record.packageName,
      package_version: record.packageVersion,
      package_integrity: record.packageIntegrity,
      dsh_bundle_patch: typeof sourceMetadata.dsh_bundle_patch === 'string' ? sourceMetadata.dsh_bundle_patch : null,
      dsh_compatibility: record.dshCompatibility,
      category: record.category as CandidatePlugin['category'],
      permissions: record.permissions as unknown as CandidatePlugin['permissions'],
      risk_level: record.riskLevel,
      risk_reasons: record.riskReasons as unknown as string[],
      risk_assessed_at: record.riskAssessedAt.toISOString(),
      risk_model_version: record.riskModelVersion,
      metadata_sha256: record.metadataSha256,
      discovered_at: record.discoveredAt.toISOString(),
      last_observed_at: record.lastObservedAt.toISOString(),
      status: 'COLLECTED_UNVERIFIED',
      retry_count: record.retryCount,
      last_error: record.lastError,
    }
  }
}

function candidateCanonicalKey(candidate: PublicSourceCandidate): string {
  return `${candidate.repository.toLowerCase()}#${candidate.bundle_directory ?? ''}`
}
