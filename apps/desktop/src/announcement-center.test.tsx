import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AnnouncementCenter } from './announcement-center.js'
import { bundledAnnouncements } from './control-plane.js'

describe('Announcement Center', () => {
  it('renders a plain-text offline banner and read controls', () => {
    const markup = renderToStaticMarkup(<AnnouncementCenter announcements={bundledAnnouncements} />)
    expect(markup).toContain('HarnessHub Beta 运行基础已更新')
    expect(markup).toContain('标记已读')
    expect(markup).toContain('全部公告')
    expect(markup).not.toContain('dangerouslySetInnerHTML')
  })
})
