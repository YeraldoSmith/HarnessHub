import { readFileSync } from 'node:fs'

import { BadRequestException, NotFoundException } from '@nestjs/common'
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
    expect(result.items[0]?.id).toBe('harnesshub-registry-demo')
  })

  it('supports basic read-only search', async () => {
    await expect(service.list({ q: 'registry' })).resolves.toMatchObject({ total: 1 })
    await expect(service.list({ q: 'YeraldoSmith' })).resolves.toMatchObject({ total: 1 })
    await expect(service.list({ q: 'not-present' })).resolves.toMatchObject({ total: 0 })
    await expect(service.list({ q: 'testing' })).resolves.toMatchObject({ total: 1 })
  })

  it('filters by category and supports stable recent ordering', async () => {
    const repository = new MemoryPluginRepository([
      mockPlugin,
      {
        ...mockPlugin,
        id: 'recent-data-plugin',
        name: 'Recent Data Plugin',
        category: 'Data',
        checked_at: '2026-08-20T12:00:00.000Z',
      },
    ])
    const filteredService = new PluginService(repository)

    const categoryResult = await filteredService.list({ category: 'Data' })
    const recentResult = await filteredService.list({ sort: 'recent' })

    expect(categoryResult.items.map((plugin) => plugin.id)).toEqual(['recent-data-plugin'])
    expect(recentResult.items[0]?.id).toBe('recent-data-plugin')
  })

  it('returns stable pagination metadata', async () => {
    const pagedRepository = new MemoryPluginRepository([
      mockPlugin,
      { ...mockPlugin, id: 'second-registry-plugin', name: 'Second Registry Plugin' },
    ])
    const pagedService = new PluginService(pagedRepository)
    const firstPage = await pagedService.list({ page: '1', limit: '1' })
    const secondPage = await pagedService.list({ page: '2', limit: '1' })

    expect(firstPage).toMatchObject({ total: 2, page: 1, hasNext: true })
    expect(firstPage.items).toHaveLength(1)
    expect(secondPage).toMatchObject({ total: 2, page: 2, hasNext: false })
    expect(secondPage.items).toHaveLength(1)
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id)
  })

  it('rejects invalid pagination input', async () => {
    await expect(service.list({ page: '0', limit: '20' })).rejects.toThrow(BadRequestException)
    await expect(service.list({ page: '1', limit: '101' })).rejects.toThrow(BadRequestException)
  })

  it('returns a not-found error for unknown plugins', async () => {
    await expect(service.getById('missing-plugin')).rejects.toThrow(NotFoundException)
  })

  it('lists and compares immutable snapshot records', async () => {
    const historyRepository = new MemoryPluginRepository([mockPlugin])
    const historyService = new PluginService(historyRepository)
    await historyRepository.saveSnapshot({
      checked_at: '2026-08-20T02:00:00.000Z',
      plugin: {
        ...mockPlugin,
        version: '0.2.0-mock.1',
        checked_at: '2026-08-20T02:00:00.000Z',
      },
    })
    const history = await historyService.listSnapshots(mockPlugin.id)
    const comparison = await historyService.compareSnapshots(
      mockPlugin.id,
      history[1]?.id,
      history[0]?.id,
    )

    expect(history).toHaveLength(2)
    expect(comparison.changes).toContainEqual({
      field: 'version',
      before: mockPlugin.version,
      after: '0.2.0-mock.1',
    })
  })

  it('requires both snapshot IDs for comparisons', async () => {
    await expect(service.compareSnapshots(mockPlugin.id, 'snapshot-1')).rejects.toThrow(
      BadRequestException,
    )
  })
})
