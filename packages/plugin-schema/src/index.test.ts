import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { pluginSchema, registryResponseSchema } from './index.js'

const mockPlugin = pluginSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../tests/fixtures/mock-plugin.json', import.meta.url), 'utf8'),
  ),
)

describe('plugin schema', () => {
  it('accepts the Phase 1 mock plugin', () => {
    expect(pluginSchema.parse(mockPlugin)).toEqual(mockPlugin)
  })

  it('rejects an unknown permission', () => {
    const result = pluginSchema.safeParse({
      ...mockPlugin,
      permissions: [
        {
          id: 'unbounded-root-access',
          label: 'Unknown',
          description: 'Not part of the permission vocabulary.',
          risk: 'high',
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('validates registry envelopes', () => {
    const result = registryResponseSchema.parse({ data: [mockPlugin], total: 1 })
    expect(result.total).toBe(1)
  })
})
