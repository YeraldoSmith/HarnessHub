import { useEffect, useMemo, useState } from 'react'

import { LanguageSelect, useI18n } from '@harnesshub/i18n'
import type { AuthSessionResponse, Plugin, PluginSnapshotRecord } from '@harnesshub/types'
import { IdentityBadge, PluginCard, PluginDetail } from '@harnesshub/ui'

import {
  getAuthSession,
  getPlugin,
  githubLoginUrl,
  listPlugins,
  listPluginSnapshots,
  logout,
} from './api.js'

type LoadState = 'loading' | 'ready' | 'error'

function pluginIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/plugins\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function App() {
  const { t } = useI18n()
  const pluginId = useMemo(pluginIdFromPath, [])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null)
  const [snapshots, setSnapshots] = useState<PluginSnapshotRecord[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [auth, setAuth] = useState<AuthSessionResponse>({ authenticated: false })
  const [authBusy, setAuthBusy] = useState(true)

  useEffect(() => {
    let active = true
    void getAuthSession()
      .then((session) => {
        if (active) setAuth(session)
      })
      .catch(() => {
        if (active) setAuth({ authenticated: false })
      })
      .finally(() => {
        if (active) setAuthBusy(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoadState('loading')

    void (async () => {
      try {
        if (pluginId) {
          const [plugin, history] = await Promise.all([
            getPlugin(pluginId),
            listPluginSnapshots(pluginId),
          ])
          if (!active) return
          setSelectedPlugin(plugin)
          setSnapshots(history)
        } else {
          const result = await listPlugins(query, page)
          if (!active) return
          setPlugins(result.items)
          setTotal(result.total)
          setHasNext(result.hasNext)
        }
        setLoadState('ready')
      } catch {
        if (!active) return
        setError(t('status.registryRequestFailed'))
        setLoadState('error')
      }
    })()

    return () => {
      active = false
    }
  }, [pluginId, query, page, t])

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label={t('web.homeLabel')}>
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            <strong>HarnessHub</strong>
            <small>{t('web.brandSubtitle')}</small>
          </span>
        </a>
        <nav aria-label={t('web.primaryNavigation')}>
          <a href="/">{t('nav.registry')}</a>
          <a href="#principles">{t('nav.principles')}</a>
        </nav>
        <div className="header-auth">
          <span className="phase-pill">{t('web.phase')}</span>
          <LanguageSelect className="language-select" />
          {auth.authenticated ? (
            <div className="signed-in-user">
              {auth.user.github.avatar_url ? (
                <img alt="" src={auth.user.github.avatar_url} />
              ) : null}
              <span>{auth.user.github.login ?? `GitHub ${auth.user.github.user_id}`}</span>
              {auth.user.badges.includes('FOUNDER') ? <IdentityBadge kind="founder" /> : null}
              <button
                disabled={authBusy}
                onClick={() => {
                  setAuthBusy(true)
                  void logout()
                    .then(() => setAuth({ authenticated: false }))
                    .finally(() => setAuthBusy(false))
                }}
                type="button"
              >
                {t('auth.signOut')}
              </button>
            </div>
          ) : (
            <a className="github-login" href={githubLoginUrl}>
              {t('auth.signIn')}
            </a>
          )}
        </div>
      </header>

      <main>
        {pluginId ? (
          <section className="detail-layout">
            <a className="back-link" href="/">
              {t('web.backToRegistry')}
            </a>
            {loadState === 'ready' && selectedPlugin ? (
              <PluginDetail plugin={selectedPlugin} snapshots={snapshots} />
            ) : null}
            <LoadMessage state={loadState} error={error} />
          </section>
        ) : (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">{t('web.marketplace')}</div>
                <h1>
                  {t('web.heroTitleFirst')}
                  <br />
                  <em>{t('web.heroTitleSecond')}</em>
                </h1>
                <p>{t('web.heroDescription')}</p>
                <div className="founder-line">
                  <span>{t('web.createdBy')}</span>
                  <IdentityBadge kind="founder" />
                </div>
              </div>
              <aside className="registry-note">
                <span className="registry-note__number">01</span>
                <div>
                  <strong>{t('web.registryFirst')}</strong>
                  <p>{t('web.registryFirstDescription')}</p>
                </div>
              </aside>
            </section>

            <section className="registry-section" aria-labelledby="registry-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{t('web.pluginRegistry')}</span>
                  <h2 id="registry-heading">{t('web.exploreFoundation')}</h2>
                </div>
                <label className="search-box">
                  <span className="sr-only">{t('web.searchLabel')}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
                  </svg>
                  <input
                    type="search"
                    placeholder={t('web.searchPlaceholder')}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setPage(1)
                    }}
                  />
                </label>
              </div>

              <LoadMessage state={loadState} error={error} />
              {loadState === 'ready' ? (
                <div className="plugin-grid">
                  {plugins.map((plugin) => (
                    <PluginCard href={`/plugins/${plugin.id}`} key={plugin.id} plugin={plugin} />
                  ))}
                  {plugins.length === 0 ? (
                    <div className="empty-state">
                      <strong>{t('web.noMatches')}</strong>
                      <span>{t('web.tryDifferentSearch')}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {loadState === 'ready' && total > 0 ? (
                <nav className="registry-pagination" aria-label={t('web.pagination')}>
                  <button disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">
                    {t('web.previous')}
                  </button>
                  <span>
                    {t('web.pageSummary', { page, total })}
                  </span>
                  <button disabled={!hasNext} onClick={() => setPage((value) => value + 1)} type="button">
                    {t('web.next')}
                  </button>
                </nav>
              ) : null}
            </section>

            <section className="principles" id="principles">
              <div>
                <span className="eyebrow">{t('web.whatIsHarnessHub')}</span>
                <h2>{t('web.openTrustworthy')}</h2>
              </div>
              <div className="principle-grid">
                <article>
                  <span>01</span>
                  <h3>{t('web.principleOneTitle')}</h3>
                  <p>{t('web.principleOneBody')}</p>
                </article>
                <article>
                  <span>02</span>
                  <h3>{t('web.principleTwoTitle')}</h3>
                  <p>{t('web.principleTwoBody')}</p>
                </article>
                <article>
                  <span>03</span>
                  <h3>{t('web.principleThreeTitle')}</h3>
                  <p>{t('web.principleThreeBody')}</p>
                </article>
              </div>
            </section>
          </>
        )}
      </main>

      <footer>
        <div>
          <strong>HarnessHub</strong>
          <span>{t('web.footerPositioning')}</span>
        </div>
        <span>{t('web.copyright')}</span>
      </footer>
    </div>
  )
}

function LoadMessage({ state, error }: { state: LoadState; error: string }) {
  const { t } = useI18n()
  if (state === 'loading') {
    return <div className="load-message">{t('status.loadingRegistry')}</div>
  }

  if (state === 'error') {
    return (
      <div className="load-message load-message--error" role="alert">
        <strong>{t('status.registryUnavailable')}</strong>
        <span>{error}</span>
      </div>
    )
  }

  return null
}
