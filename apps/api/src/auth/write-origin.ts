import { ForbiddenException } from '@nestjs/common'

function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.WEB_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,http://tauri.localhost')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

export function assertTrustedWriteOrigin(
  authorization: string | undefined,
  origin: string | undefined,
): void {
  if (authorization?.startsWith('Bearer ')) return
  if (!origin || !allowedOrigins().has(origin)) {
    throw new ForbiddenException('Write request origin is not allowed.')
  }
}
