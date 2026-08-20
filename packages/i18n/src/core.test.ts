import { describe, expect, it } from 'vitest'

import {
  defaultLocale,
  detectSystemLocale,
  normalizeLocale,
  translate,
  translationKeys,
} from './core.js'

describe('HarnessHub i18n', () => {
  it('defaults unknown languages to Simplified Chinese while normalizing supported locales', () => {
    expect(defaultLocale).toBe('zh-CN')
    expect(normalizeLocale(undefined)).toBe('zh-CN')
    expect(normalizeLocale('en-GB')).toBe('en-US')
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN')
  })

  it('exposes system detection for future automatic selection without changing the default', () => {
    expect(detectSystemLocale(['fr-FR', 'en-CA'])).toBe('en-US')
    expect(detectSystemLocale(['fr-FR'])).toBe('zh-CN')
  })

  it('keeps locale resources in key parity and interpolates parameters', () => {
    expect(translationKeys('en-US')).toEqual(translationKeys('zh-CN'))
    expect(translate('zh-CN', 'web.pageSummary', { page: 2, total: 40 })).toBe(
      '第 2 页 · 共 40 个插件',
    )
    expect(translate('en-US', 'web.pageSummary', { page: 2, total: 40 })).toBe(
      'Page 2 · 40 plugins',
    )
  })
})
