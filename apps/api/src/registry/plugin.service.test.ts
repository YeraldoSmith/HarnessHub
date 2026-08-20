import { readFileSync } from 'node:fs'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { pluginSchema } from '@harnesshub/plugin-schema'

import { MemoryPluginRepository } from './memory-plugin.repository.js'
import { PluginService } from './plugin.service.js'

const mockPlugin = pluginSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../../tests/fixtures/mock-plugin.json', import.meta.url), 'utf8'),
  ),
)

describe('PluginService with MemoryPluginRepository', () => {
  const repository = new MemoryPluginRepository([mockPlugin])
  const service = new PluginService(repository)

  it('reads the test fixture through the repository abstraction', async () => {
    const result = await service.list()
    expect(result.total).toBe(1)
    expect(result.data[0]?.id).toBe('harnesshub-registry-demo')
  })

  it('supports basic read-only search', async () => {
    await expect(service.list('registry')).resolves.toMatchObject({ total: 1 })
    await expect(service.list('YeraldoSmith')).resolves.toMatchObject({ total: 1 })
    await expect(service.list('not-present')).resolves.toMatchObject({ total: 0 })
  })

  it('returns a not-found error for unknown plugins', async () => {
    await expect(service.getById('missing-plugin')).rejects.toThrow(NotFoundException)
  })
})
