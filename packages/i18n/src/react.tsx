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

export interface I18nContextValue {
  locale: Locale
  setLocale(locale: Locale): void
  t(key: TranslationKey, params?: TranslationParams): string
}

const defaultContext: I18nContextValue = {
  locale: defaultLocale,
  setLocale: () => undefined,
  t: (key, params) => translate(defaultLocale, key, params),
}

const I18nContext = createContext<I18nContextValue>(defaultContext)

function storedLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale
  const stored = window.localStorage.getItem(localeStorageKey)
  return stored ? normalizeLocale(stored) : defaultLocale
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, updateLocale] = useState<Locale>(storedLocale)

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(localeStorageKey, locale)
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => updateLocale(nextLocale), [])
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
    [locale],
  )
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

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
      </select>
    </label>
  )
}
