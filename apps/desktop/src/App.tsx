import { useEffect, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'

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
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Registry unavailable.')
      })

    return () => {
      active = false
    }
  }, [])

  async function signIn(): Promise<void> {
    setAuthState('waiting')
    setError('')
    try {
      const startResponse = await fetch(`${apiUrl}/auth/github/desktop/start`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      if (!startResponse.ok) throw new Error(`Login could not start (${startResponse.status}).`)
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
        if (!exchangeResponse.ok) throw new Error(`Login could not finish (${exchangeResponse.status}).`)
        const exchange = desktopSessionExchangeResponseSchema.parse(await exchangeResponse.json())
        if (exchange.status === 'COMPLETE') {
          setSessionToken(exchange.session_token)
          setAuth(exchange.session)
          setAuthState('idle')
          return
        }
      }
      throw new Error('GitHub login expired. Please try again.')
    } catch (reason) {
      setAuthState('error')
      setError(reason instanceof Error ? reason.message : 'GitHub login failed.')
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
            <small>Desktop preview</small>
          </div>
        </div>

        <nav aria-label="Desktop navigation">
          <a className="active" href="#registry">
            Registry
          </a>
          <span>Developers</span>
          <span>Requests</span>
        </nav>

        <div className="desktop-scope-note">
          <strong>Phase 2-B1</strong>
          <p>GitHub identity and secure sessions are enabled. Registry access remains read-only.</p>
        </div>
      </aside>

      <main className="desktop-main" id="registry">
        <header className="desktop-toolbar">
          <div>
            <span>Plugin Registry</span>
            <strong>Foundation preview</strong>
          </div>
          <div className="desktop-auth">
            {auth.authenticated ? (
              <>
                <span>{auth.user.github.login ?? `GitHub ${auth.user.github.user_id}`}</span>
                {auth.user.badges.includes('FOUNDER') ? <IdentityBadge kind="founder" /> : null}
                <button onClick={() => void signOut()} type="button">
                  Sign out
                </button>
              </>
            ) : (
              <button disabled={authState === 'waiting'} onClick={() => void signIn()} type="button">
                {authState === 'waiting' ? 'Waiting for GitHub…' : 'Sign in with GitHub'}
              </button>
            )}
          </div>
        </header>

        <section className="desktop-content">
          <div className="desktop-intro">
            <div>
              <span>One validated record</span>
              <h1>Registry data, clearly explained.</h1>
            </div>
            <p>
              The desktop shell reads the same PostgreSQL-backed Registry API as the Web app. No local
              DSH command is exposed in this phase. OAuth opens in your system browser and GitHub tokens
              remain on the server.
            </p>
          </div>
          {plugin ? <PluginDetail plugin={plugin} /> : null}
          {!plugin && !error ? <div className="desktop-message">Loading Registry snapshot…</div> : null}
          {error ? <div className="desktop-message desktop-message--error">{error}</div> : null}
        </section>
      </main>
    </div>
  )
}
