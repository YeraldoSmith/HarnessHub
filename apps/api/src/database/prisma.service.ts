import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client.js'

function createPostgresAdapter(connectionString: string): PrismaPg {
  const schema = new URL(connectionString).searchParams.get('schema') ?? undefined
  return new PrismaPg({ connectionString }, { schema })
}

export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the PostgreSQL Registry.')
  }

  return new PrismaClient({
    adapter: createPostgresAdapter(connectionString),
  })
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for the PostgreSQL Registry.')
    }
    super({ adapter: createPostgresAdapter(connectionString) })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
