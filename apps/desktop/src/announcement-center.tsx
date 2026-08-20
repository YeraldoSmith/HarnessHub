import { useMemo, useState } from 'react'

import { useI18n } from '@harnesshub/i18n'
import type { Announcement } from '@harnesshub/types'

const readStorageKey = 'harnesshub.announcement-read.v1'

function storedReadIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(readStorageKey) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function localized(values: Record<string, string>, locale: string): string {
  return values[locale] ?? values['zh-CN'] ?? values['en-US'] ?? Object.values(values)[0] ?? ''
}

export function AnnouncementCenter({ announcements }: { announcements: Announcement[] }) {
  const { locale, t } = useI18n()
  const [readIds, setReadIds] = useState<string[]>(storedReadIds)
  const [open, setOpen] = useState(false)
  const unread = useMemo(
    () => announcements.filter((announcement) => !readIds.includes(announcement.id)),
    [announcements, readIds],
  )
  const featured = unread[0] ?? announcements[0] ?? null

  if (!featured) return null

  const markRead = (ids: string[]) => {
    const next = [...new Set([...readIds, ...ids])]
    setReadIds(next)
    window.localStorage.setItem(readStorageKey, JSON.stringify(next))
  }

  return (
    <section className={`announcement-center announcement-center--${featured.severity.toLowerCase()}`}>
      <div className="announcement-banner" role="status">
        <span aria-hidden="true">{featured.severity === 'SECURITY' ? '!' : 'i'}</span>
        <div>
          <strong>{localized(featured.title, locale)}</strong>
          <p>{localized(featured.body, locale)}</p>
        </div>
        {unread.length > 0 ? <button onClick={() => markRead([featured.id])} type="button">{t('announcement.markRead')}</button> : null}
        <button aria-expanded={open} onClick={() => setOpen((value) => !value)} type="button">
          {open ? t('announcement.hide') : t('announcement.viewAll')}
        </button>
      </div>
      {open ? (
        <ol className="announcement-list">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <div><strong>{localized(announcement.title, locale)}</strong><time>{new Date(announcement.published_at).toLocaleDateString(locale)}</time></div>
              <p>{localized(announcement.body, locale)}</p>
              <small>{t(`announcement.severity${announcement.severity}`)}</small>
            </li>
          ))}
          {unread.length > 0 ? <button onClick={() => markRead(unread.map(({ id }) => id))} type="button">{t('announcement.markAllRead')}</button> : null}
        </ol>
      ) : null}
    </section>
  )
}
