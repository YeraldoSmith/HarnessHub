import { useEffect, useMemo, useState } from 'react'

import type { Plugin } from '@harnesshub/types'
import { IdentityBadge, PluginCard, PluginDetail } from '@harnesshub/ui'

import { getPlugin, listPlugins } from './api.js'

type LoadState = 'loading' | 'ready' | 'error'

function pluginIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/plugins\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function App() {
  const pluginId = useMemo(pluginIdFromPath, [])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null)
  const [query, setQuery] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoadState('loading')

    const load = pluginId ? getPlugin(pluginId) : listPlugins(query)
    void load
      .then((result) => {
        if (!active) return

        if (Array.isArray(result)) {
          setPlugins(result)
        } else if ('data' in result) {
          setPlugins(result.data)
        } else {
          setSelectedPlugin(result)
        }
        setLoadState('ready')
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'The registry could not be loaded.')
        setLoadState('error')
      })

    return () => {
      active = false
    }
  }, [pluginId, query])

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="HarnessHub home">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            <strong>HarnessHub</strong>
            <small>Agent plugin registry</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="/">Registry</a>
          <a href="#principles">Principles</a>
        </nav>
        <span className="phase-pill">Phase 1-B · Real Registry</span>
      </header>

      <main>
        {pluginId ? (
          <section className="detail-layout">
            <a className="back-link" href="/">
              ← Back to registry
            </a>
            {loadState === 'ready' && selectedPlugin ? <PluginDetail plugin={selectedPlugin} /> : null}
            <LoadMessage state={loadState} error={error} />
          </section>
        ) : (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">Community Marketplace for AI Agent Plugins</div>
                <h1>
                  Discover plugins.
                  <br />
                  Understand <em>before</em> you install.
                </h1>
                <p>
                  HarnessHub turns plugin sources, versions, permissions, compatibility and licensing
                  into a registry people can actually evaluate.
                </p>
                <div className="founder-line">
                  <span>Created by YeraldoSmith</span>
                  <IdentityBadge kind="founder" />
                </div>
              </div>
              <aside className="registry-note">
                <span className="registry-note__number">01</span>
                <div>
                  <strong>Registry first</strong>
                  <p>
                    This phase reads manually allowlisted DSH sources through immutable GitHub and npm
                    evidence. Community and payment features are intentionally absent.
                  </p>
                </div>
              </aside>
            </section>

            <section className="registry-section" aria-labelledby="registry-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Plugin registry</span>
                  <h2 id="registry-heading">Explore the foundation</h2>
                </div>
                <label className="search-box">
                  <span className="sr-only">Search plugins</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search by name, author, or category"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
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
                      <strong>No matching plugins</strong>
                      <span>Try a different name, author, or category.</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="principles" id="principles">
              <div>
                <span className="eyebrow">What HarnessHub is</span>
                <h2>Open, but trustworthy.</h2>
              </div>
              <div className="principle-grid">
                <article>
                  <span>01</span>
                  <h3>An ecosystem entry point</h3>
                  <p>Structured plugin evidence instead of an unfiltered repository list.</p>
                </article>
                <article>
                  <span>02</span>
                  <h3>A user and developer community</h3>
                  <p>Transparent roles and rules, introduced only when their phase is ready.</p>
                </article>
                <article>
                  <span>03</span>
                  <h3>Public by default</h3>
                  <p>Browsing stays open. Trust labels keep one precise, auditable meaning.</p>
                </article>
              </div>
            </section>
          </>
        )}
      </main>

      <footer>
        <div>
          <strong>HarnessHub</strong>
          <span>面向 AI Agent 插件生态的社区型市场平台</span>
        </div>
        <span>Created by YeraldoSmith · Copyright © 2026 YeraldoSmith</span>
      </footer>
    </div>
  )
}

function LoadMessage({ state, error }: { state: LoadState; error: string }) {
  if (state === 'loading') {
    return <div className="load-message">Loading the registry…</div>
  }

  if (state === 'error') {
    return (
      <div className="load-message load-message--error" role="alert">
        <strong>Registry unavailable</strong>
        <span>{error}</span>
      </div>
    )
  }

  return null
}
