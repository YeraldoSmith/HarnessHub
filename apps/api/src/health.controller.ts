import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'harnesshub-registry',
      phase: '1-d-production-hardening',
    } as const
  }
}
