import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client.js'

export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the PostgreSQL Registry.')
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for the PostgreSQL Registry.')
    }
    super({ adapter: new PrismaPg({ connectionString }) })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
