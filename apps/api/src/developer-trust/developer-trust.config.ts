import { Injectable } from '@nestjs/common'

@Injectable()
export class DeveloperTrustConfig {
  claimTtlMs(): number {
    const seconds = Number(process.env.DEVELOPER_CLAIM_TTL_SECONDS ?? 86_400)
    if (!Number.isInteger(seconds) || seconds < 300 || seconds > 604_800) {
      throw new Error('DEVELOPER_CLAIM_TTL_SECONDS must be between 300 and 604800.')
    }
    return seconds * 1000
  }
}
