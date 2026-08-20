import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const origins = (process.env.WEB_ORIGINS ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:1420,http://127.0.0.1:1420')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.enableCors({ origin: origins, methods: ['GET'] })

  const host = process.env.API_HOST ?? '127.0.0.1'
  const port = Number(process.env.API_PORT ?? '3001')

  await app.listen(port, host)
  console.log(`HarnessHub Registry API listening at http://${host}:${port}`)
}

void bootstrap()
