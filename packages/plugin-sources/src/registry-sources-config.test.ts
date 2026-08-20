import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { manualPluginSourceListSchema } from './types.js'

const sources = manualPluginSourceListSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../config/registry-sources.json', import.meta.url), 'utf8'),
  ),
)

describe('Beta Registry source allowlist', () => {
  it('contains 20 unique production sources', () => {
    expect(sources).toHaveLength(20)
    expect(new Set(sources.map((source) => source.id)).size).toBe(20)
    expect(new Set(sources.map((source) => source.npm.package_name)).size).toBe(20)
  })

  it('uses the Beta category vocabulary and only GitHub/npm evidence sources', () => {
    const categories = new Set([
      'Coding',
      'Browser',
      'Productivity',
      'Research',
      'Data',
      'Automation',
      'Developer Tools',
      'Other',
    ])

    for (const source of sources) {
      expect(categories.has(source.category)).toBe(true)
      expect(source.github.repository).toMatch(/^[^/]+\/[^/]+$/)
      expect(source.npm.package_name.length).toBeGreaterThan(0)
    }
  })
})
