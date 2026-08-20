import enUS from './locales/en-US.json' with { type: 'json' }
import zhCN from './locales/zh-CN.json' with { type: 'json' }

export const supportedLocales = ['zh-CN', 'en-US'] as const
export type Locale = (typeof supportedLocales)[number]
export const defaultLocale: Locale = 'zh-CN'

type NestedKeys<T> = {
  [Key in keyof T & string]: T[Key] extends string
    ? Key
    : T[Key] extends Record<string, unknown>
      ? `${Key}.${NestedKeys<T[Key]>}`
      : never
}[keyof T & string]

export type TranslationKey = NestedKeys<typeof zhCN>
export type TranslationParams = Record<string, string | number>

const resources: Record<Locale, Record<string, unknown>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

export function normalizeLocale(value: string | null | undefined): Locale {
  const normalized = value?.trim().toLowerCase()
  if (normalized?.startsWith('en')) return 'en-US'
  if (normalized?.startsWith('zh')) return 'zh-CN'
  return defaultLocale
}

export function detectSystemLocale(languages?: readonly string[]): Locale {
  const candidates = languages ?? (typeof navigator === 'undefined' ? [] : navigator.languages)
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase()
    if (normalized.startsWith('zh')) return 'zh-CN'
    if (normalized.startsWith('en')) return 'en-US'
  }
  return defaultLocale
}

function lookup(locale: Locale, key: TranslationKey): string | undefined {
  let current: unknown = resources[locale]
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' ? current : undefined
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  const template = lookup(locale, key) ?? lookup(defaultLocale, key) ?? key
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export function translationKeys(locale: Locale): string[] {
  const keys: string[] = []
  const visit = (value: Record<string, unknown>, prefix = '') => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (typeof child === 'string') keys.push(path)
      else if (child && typeof child === 'object') visit(child as Record<string, unknown>, path)
    }
  }
  visit(resources[locale])
  return keys.sort()
}
