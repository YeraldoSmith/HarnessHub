import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'

import { AuthModule } from './auth/auth.module.js'
import { DatabaseModule } from './database/database.module.js'
import { DeveloperTrustModule } from './developer-trust/developer-trust.module.js'
import { HealthController } from './health.controller.js'
import { ApiExceptionFilter } from './http/api-exception.filter.js'
import { RegistryModule } from './registry/registry.module.js'

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return value
}

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([
      {
        ttl: positiveInteger('API_RATE_LIMIT_TTL_MS', 60_000),
        limit: positiveInteger('API_RATE_LIMIT', 120),
      },
    ]),
    RegistryModule,
    AuthModule,
    DeveloperTrustModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
