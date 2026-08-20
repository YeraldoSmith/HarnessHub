import { describe, expect, it } from 'vitest'

import type { RemoteConfigProvider } from './control-plane.js'
import {
  bundledAnnouncements,
  defaultRemoteConfig,
  loadAnnouncements,
  loadRemoteConfig,
} from './control-plane.js'

class FixtureProvider implements RemoteConfigProvider {
  constructor(private readonly value: unknown) {}
  load(): Promise<unknown> { return Promise.resolve(this.value) }
}

describe('Beta remote control plane', () => {
  it('keeps GitHub login disabled in the offline default', () => {
    expect(defaultRemoteConfig.features.github_login).toBe(false)
    expect(defaultRemoteConfig.services.api_url).toBe('')
  })

  it('accepts UI-only feature configuration over HTTPS', async () => {
    const config = await loadRemoteConfig(new FixtureProvider({
      ...defaultRemoteConfig,
      features: { github_login: true, announcements: true },
      services: { api_url: 'https://api.example.com', announcements_url: 'https://cdn.example.com/announcement.json' },
    }))
    expect(config.features.github_login).toBe(true)
  })

  it('rejects unsafe service schemes and falls back offline', async () => {
    const config = await loadRemoteConfig(new FixtureProvider({
      ...defaultRemoteConfig,
      services: { api_url: 'file:///tmp/api', announcements_url: '' },
    }))
    expect(config).toEqual(defaultRemoteConfig)
  })

  it('rejects remote attempts to add install or execution policy', async () => {
    const config = await loadRemoteConfig(new FixtureProvider({
      ...defaultRemoteConfig,
      install_policy: { allow_unknown_code: true },
    }))
    expect(config).toEqual(defaultRemoteConfig)
  })

  it('ships a validated offline announcement', async () => {
    const announcements = await loadAnnouncements(defaultRemoteConfig)
    expect(announcements).toEqual(bundledAnnouncements)
  })
})
