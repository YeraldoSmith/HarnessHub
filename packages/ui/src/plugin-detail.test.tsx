import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { pluginSchema } from '@harnesshub/plugin-schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PluginDetail } from './plugin-detail.js'

const fixture = pluginSchema.parse(
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/mock-plugin.json'), 'utf8')),
)

describe('PluginDetail', () => {
  it('renders the test-only Mock Plugin snapshot without implying production trust', () => {
    const markup = renderToStaticMarkup(
      <PluginDetail
        plugin={fixture}
        snapshots={[
          {
            id: 'snapshot-1',
            plugin_id: fixture.id,
            plugin_version_id: 'version-1',
            plugin: fixture,
            checked_at: fixture.checked_at,
          },
        ]}
      />,
    )

    expect(markup).toContain('Mock Plugin · not installable')
    expect(markup).toContain('Not available')
    expect(markup).toContain('Test fixture')
    expect(markup).toContain('Snapshot history')
    expect(markup).not.toContain('◆ Founder')
  })
})
