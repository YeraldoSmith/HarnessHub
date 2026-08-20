import { Inject, Injectable } from '@nestjs/common'

import type { SyncJobRecord } from '@harnesshub/types'

import { PrismaService } from '../database/prisma.service.js'
import { SyncJobStatus, type SyncJob } from '../generated/prisma/client.js'
import type { SyncJobRepository } from './sync-job.repository.js'

@Injectable()
export class PrismaSyncJobRepository implements SyncJobRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(pluginId: string, source: string): Promise<SyncJobRecord> {
    return this.toRecord(
      await this.prisma.syncJob.create({
        data: { pluginId, source, status: SyncJobStatus.PENDING },
      }),
    )
  }

  async start(id: string): Promise<SyncJobRecord> {
    return this.toRecord(
      await this.prisma.syncJob.update({
        where: { id },
        data: { status: SyncJobStatus.RUNNING, startedAt: new Date() },
      }),
    )
  }

  async succeed(id: string): Promise<SyncJobRecord> {
    return this.toRecord(
      await this.prisma.syncJob.update({
        where: { id },
        data: { status: SyncJobStatus.SUCCESS, finishedAt: new Date(), error: null },
      }),
    )
  }

  async fail(id: string, error: string): Promise<SyncJobRecord> {
    return this.toRecord(
      await this.prisma.syncJob.update({
        where: { id },
        data: {
          status: SyncJobStatus.FAILED,
          finishedAt: new Date(),
          error: error.slice(0, 2_000),
        },
      }),
    )
  }

  async list(pluginId?: string): Promise<SyncJobRecord[]> {
    const jobs = await this.prisma.syncJob.findMany({
      where: pluginId ? { pluginId } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    })
    return jobs.map((job) => this.toRecord(job))
  }

  private toRecord(job: SyncJob): SyncJobRecord {
    return {
      id: job.id,
      plugin_id: job.pluginId,
      source: job.source,
      status: job.status,
      started_at: job.startedAt?.toISOString() ?? null,
      finished_at: job.finishedAt?.toISOString() ?? null,
      error: job.error,
      created_at: job.createdAt.toISOString(),
    }
  }
}
