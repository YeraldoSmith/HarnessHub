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
  it('renders localized UI around unchanged third-party plugin content', () => {
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

    expect(markup).toContain('模拟插件 · 不可安装')
    expect(markup).toContain('不可用')
    expect(markup).toContain('测试数据')
    expect(markup).toContain('快照历史 Snapshot')
    expect(markup).toContain(fixture.name)
    expect(markup).toContain(fixture.description)
    expect(markup).not.toContain('◆ Founder')
  })
})
