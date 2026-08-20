import { describe, expect, it } from 'vitest'

import { bundledRegistry, loadDesktopRegistry } from './registry-client.js'

describe('Desktop Registry client', () => {
  it('ships a validated production snapshot instead of mock data', () => {
    expect(bundledRegistry.total).toBeGreaterThanOrEqual(20)
    expect(bundledRegistry.items).toHaveLength(bundledRegistry.total)
    expect(bundledRegistry.items.every((plugin) => !plugin.is_mock)).toBe(true)
    expect(bundledRegistry.items.every((plugin) => plugin.source_evidence.length >= 2)).toBe(true)
  })

  it('uses the bundled snapshot when the API is offline', async () => {
    const result = await loadDesktopRegistry(async () => {
      throw new TypeError('Load failed')
    })

    expect(result.source).toBe('BUNDLED')
    expect(result.registry.items).toHaveLength(bundledRegistry.items.length)
  })

  it('prefers a valid live Registry response', async () => {
    const result = await loadDesktopRegistry(async () => new Response(JSON.stringify(bundledRegistry), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(result.source).toBe('LIVE')
  })
})
