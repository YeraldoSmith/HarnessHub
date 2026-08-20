import {
  announcementListSchema,
  remoteConfigSchema,
} from '@harnesshub/plugin-schema'
import type { Announcement, RemoteConfig } from '@harnesshub/types'

import bundledAnnouncementsJson from './announcement.json'
import defaultConfigJson from './default-config.json'

const configCacheKey = 'harnesshub.remote-config.v1'
const announcementCacheKey = 'harnesshub.announcements.v1'

export interface RemoteConfigProvider {
  load(): Promise<unknown>
}

export class HttpJsonProvider implements RemoteConfigProvider {
  constructor(
    private readonly url: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async load(): Promise<unknown> {
    const response = await this.fetcher(this.url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`Remote configuration status ${response.status}.`)
    return response.json()
  }
}

export const defaultRemoteConfig: RemoteConfig = remoteConfigSchema.parse(defaultConfigJson)
export const bundledAnnouncements: Announcement[] = announcementListSchema.parse(bundledAnnouncementsJson)

function isAllowedRemoteUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

function validatedConfig(value: unknown): RemoteConfig {
  const config = remoteConfigSchema.parse(value)
  if (!isAllowedRemoteUrl(config.services.api_url)) throw new Error('Remote API URL is not allowed.')
  if (!isAllowedRemoteUrl(config.services.announcements_url)) {
    throw new Error('Remote announcement URL is not allowed.')
  }
  return config
}

function readCache<T>(key: string, parser: (value: unknown) => T): T | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(key)
  if (!stored) return null
  try {
    return parser(JSON.parse(stored))
  } catch {
    return null
  }
}

function writeCache(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function configuredRemoteUrl(): string {
  const value = import.meta.env.VITE_HARNESSHUB_REMOTE_CONFIG_URL?.trim() ?? ''
  return isAllowedRemoteUrl(value) ? value : ''
}

export async function loadRemoteConfig(provider?: RemoteConfigProvider): Promise<RemoteConfig> {
  const selected = provider ?? (configuredRemoteUrl() ? new HttpJsonProvider(configuredRemoteUrl()) : null)
  if (selected) {
    try {
      const config = validatedConfig(await selected.load())
      writeCache(configCacheKey, config)
      return config
    } catch {
      const cached = readCache(configCacheKey, validatedConfig)
      if (cached) return cached
    }
  }
  return defaultRemoteConfig
}

export async function loadAnnouncements(
  config: RemoteConfig,
  provider?: RemoteConfigProvider,
): Promise<Announcement[]> {
  if (!config.features.announcements) return []
  const selected = provider ?? (config.services.announcements_url
    ? new HttpJsonProvider(config.services.announcements_url)
    : null)
  if (selected) {
    try {
      const announcements = announcementListSchema.parse(await selected.load())
      writeCache(announcementCacheKey, announcements)
      return activeAnnouncements(announcements)
    } catch {
      const cached = readCache(announcementCacheKey, (value) => announcementListSchema.parse(value))
      if (cached) return activeAnnouncements(cached)
    }
  }
  return activeAnnouncements(bundledAnnouncements)
}

function activeAnnouncements(announcements: Announcement[], now = new Date()): Announcement[] {
  return announcements
    .filter((announcement) => !announcement.expires_at || new Date(announcement.expires_at) > now)
    .sort((left, right) => right.published_at.localeCompare(left.published_at))
}
