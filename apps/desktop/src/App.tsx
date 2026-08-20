import { useEffect, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'

import { LanguageSelect, useI18n } from '@harnesshub/i18n'
import {
  desktopOAuthStartResponseSchema,
  desktopSessionExchangeResponseSchema,
  registryResponseSchema,
} from '@harnesshub/plugin-schema'
import type { AuthSessionResponse, Plugin } from '@harnesshub/types'
import { IdentityBadge, PluginDetail } from '@harnesshub/ui'

const apiUrl = 'http://127.0.0.1:3001'

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function App() {
  const { t } = useI18n()
  const [plugin, setPlugin] = useState<Plugin | null>(null)
  const [error, setError] = useState('')
  const [auth, setAuth] = useState<AuthSessionResponse>({ authenticated: false })
  const [authState, setAuthState] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetch(`${apiUrl}/plugins`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Registry request failed with status ${response.status}.`)
        return registryResponseSchema.parse(await response.json())
      })
      .then((registry) => {
        if (active) setPlugin(registry.items[0] ?? null)
      })
      .catch(() => {
        if (active) setError(t('status.registryRequestFailed'))
      })

    return () => {
      active = false
    }
  }, [t])

  async function signIn(): Promise<void> {
    setAuthState('waiting')
    setError('')
    try {
      const startResponse = await fetch(`${apiUrl}/auth/github/desktop/start`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      if (!startResponse.ok) {
        throw new Error(t('auth.loginStartFailed', { status: startResponse.status }))
      }
      const started = desktopOAuthStartResponseSchema.parse(await startResponse.json())
      await openUrl(started.authorization_url)

      while (Date.now() < Date.parse(started.expires_at)) {
        await wait(1500)
        const exchangeResponse = await fetch(`${apiUrl}/auth/github/desktop/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            transaction_id: started.transaction_id,
            poll_token: started.poll_token,
          }),
        })
        if (!exchangeResponse.ok) {
          throw new Error(t('auth.loginFinishFailed', { status: exchangeResponse.status }))
        }
        const exchange = desktopSessionExchangeResponseSchema.parse(await exchangeResponse.json())
        if (exchange.status === 'COMPLETE') {
          setSessionToken(exchange.session_token)
          setAuth(exchange.session)
          setAuthState('idle')
          return
        }
      }
      throw new Error(t('auth.loginExpired'))
    } catch (reason) {
      setAuthState('error')
      setError(reason instanceof Error ? reason.message : t('auth.loginFailed'))
    }
  }

  async function signOut(): Promise<void> {
    if (sessionToken) {
      await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(() => undefined)
    }
    setSessionToken(null)
    setAuth({ authenticated: false })
    setAuthState('idle')
  }

  return (
    <div className="desktop-shell">
      <aside className="desktop-sidebar">
        <div className="desktop-brand">
          <span aria-hidden="true">H</span>
          <div>
            <strong>HarnessHub</strong>
            <small>{t('desktop.preview')}</small>
          </div>
        </div>

        <nav aria-label={t('desktop.navigation')}>
          <a className="active" href="#registry">
            {t('nav.registry')}
          </a>
          <span>{t('nav.developers')}</span>
          <span>{t('nav.requests')}</span>
        </nav>

        <div className="desktop-scope-note">
          <strong>{t('desktop.phase')}</strong>
          <p>{t('desktop.scope')}</p>
        </div>
      </aside>

      <main className="desktop-main" id="registry">
        <header className="desktop-toolbar">
          <div>
            <span>{t('desktop.toolbarLabel')}</span>
            <strong>{t('desktop.foundationPreview')}</strong>
          </div>
          <div className="desktop-auth">
            {auth.authenticated ? (
              <>
                <span>{auth.user.github.login ?? `GitHub ${auth.user.github.user_id}`}</span>
                {auth.user.badges.includes('FOUNDER') ? <IdentityBadge kind="founder" /> : null}
                <button onClick={() => void signOut()} type="button">
                {t('auth.signOut')}
                </button>
              </>
            ) : (
              <button disabled={authState === 'waiting'} onClick={() => void signIn()} type="button">
                {authState === 'waiting' ? t('auth.waiting') : t('auth.signIn')}
              </button>
            )}
            <LanguageSelect className="desktop-language-select" />
          </div>
        </header>

        <section className="desktop-content">
          <div className="desktop-intro">
            <div>
              <span>{t('desktop.validatedRecord')}</span>
              <h1>{t('desktop.title')}</h1>
            </div>
            <p>{t('desktop.description')}</p>
          </div>
          {plugin ? <PluginDetail plugin={plugin} /> : null}
          {!plugin && !error ? <div className="desktop-message">{t('desktop.loading')}</div> : null}
          {error ? <div className="desktop-message desktop-message--error">{error}</div> : null}
        </section>
      </main>
    </div>
  )
}
