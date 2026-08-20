import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  defaultLocale,
  type Locale,
  normalizeLocale,
  type TranslationKey,
  type TranslationParams,
  translate,
} from './core.js'

const localeStorageKey = 'harnesshub.locale'
const themeStorageKey = 'harnesshub.theme'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface I18nContextValue {
  locale: Locale
  setLocale(locale: Locale): void
  theme: ThemePreference
  setTheme(theme: ThemePreference): void
  t(key: TranslationKey, params?: TranslationParams): string
}

const defaultContext: I18nContextValue = {
  locale: defaultLocale,
  setLocale: () => undefined,
  theme: 'system',
  setTheme: () => undefined,
  t: (key, params) => translate(defaultLocale, key, params),
}

const I18nContext = createContext<I18nContextValue>(defaultContext)

function storedLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale
  const stored = window.localStorage.getItem(localeStorageKey)
  return stored ? normalizeLocale(stored) : defaultLocale
}

function storedTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(themeStorageKey)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, updateLocale] = useState<Locale>(storedLocale)
  const [theme, updateTheme] = useState<ThemePreference>(storedTheme)

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(localeStorageKey, locale)
  }, [locale])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    window.localStorage.setItem(themeStorageKey, theme)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setLocale = useCallback((nextLocale: Locale) => updateLocale(nextLocale), [])
  const setTheme = useCallback((nextTheme: ThemePreference) => updateTheme(nextTheme), [])
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
    [locale],
  )
  const value = useMemo(() => ({ locale, setLocale, theme, setTheme, t }), [locale, setLocale, theme, setTheme, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}

export function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className={className}>
      <select
        aria-label={t('language.select')}
        onChange={(event) => setLocale(event.target.value as Locale)}
        value={locale}
      >
        <option value="zh-CN">{t('language.zhCN')}</option>
        <option value="en-US">{t('language.enUS')}</option>
        <option value="ja-JP">{t('language.jaJP')}</option>
        <option value="ko-KR">{t('language.koKR')}</option>
        <option value="es-ES">{t('language.esES')}</option>
      </select>
    </label>
  )
}

export function ThemeSelect({ className }: { className?: string }) {
  const { theme, setTheme, t } = useI18n()
  return (
    <label className={className}>
      <select aria-label={t('productPages.theme')} onChange={(event) => setTheme(event.target.value as ThemePreference)} value={theme}>
        <option value="system">{t('productPages.themeSystem')}</option>
        <option value="light">{t('productPages.themeLight')}</option>
        <option value="dark">{t('productPages.themeDark')}</option>
      </select>
    </label>
  )
}
