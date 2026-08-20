import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'harnesshub-registry',
      phase: '2-b1-github-oauth',
    } as const
  }
}
