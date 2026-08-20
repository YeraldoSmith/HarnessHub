import { useCallback, useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'

import { LanguageSelect, useI18n } from '@harnesshub/i18n'
import {
  desktopOAuthStartResponseSchema,
  desktopSessionExchangeResponseSchema,
  registryResponseSchema,
} from '@harnesshub/plugin-schema'
import type { AuthSessionResponse, Plugin } from '@harnesshub/types'
import { IdentityBadge } from '@harnesshub/ui'
import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'
import type { RuntimeEnvironmentSnapshot } from '@harnesshub/runtime-integration'

import { InstallationPrototypePanel } from './installation-prototype.js'
import { AgentWorkspace } from './agent-workspace.js'
import { DesktopMarketplace } from './marketplace.js'
import { RuntimeBridgePanel } from './runtime-bridge.js'
import { RuntimeIntegrationPanel } from './runtime-integration.js'
import {
  WorkspaceDashboard,
  WorkspaceSidebar,
  type WorkspaceSection,
} from './workspace-shell.js'

const apiUrl = 'http://127.0.0.1:3001'
const showDevelopmentDetails = import.meta.env.DEV

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function App() {
  const { t } = useI18n()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [registryLoading, setRegistryLoading] = useState(true)
  const [registryError, setRegistryError] = useState('')
  const [authError, setAuthError] = useState('')
  const [auth, setAuth] = useState<AuthSessionResponse>({ authenticated: false })
  const [authState, setAuthState] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [runtimeEnvironment, setRuntimeEnvironment] = useState<RuntimeEnvironmentSnapshot | null>(null)
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<Readonly<RuntimeSnapshot> | null>(null)
  const [runtimeEvents, setRuntimeEvents] = useState<readonly Readonly<RuntimeEvent>[]>([])
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('home')
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    void fetch(`${apiUrl}/plugins?limit=100&sort=name`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Registry request failed with status ${response.status}.`)
        return registryResponseSchema.parse(await response.json())
      })
      .then((registry) => {
        if (active) setPlugins(registry.items)
      })
      .catch(() => {
        if (active) setRegistryError(t('status.registryRequestFailed'))
      })
      .finally(() => {
        if (active) setRegistryLoading(false)
      })

    return () => {
      active = false
    }
  }, [t])

  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const sections = [
      ['home', 'home'],
      ['agent-workspace', 'agent'],
      ['runtime-bridge', 'runtime'],
      ['plugins', 'plugins'],
    ] as const
    const updateActiveSection = () => {
      const marker = main.scrollTop + 150
      let next: WorkspaceSection = 'home'
      for (const [id, section] of sections) {
        const element = document.getElementById(id)
        if (element && element.offsetTop <= marker) next = section
      }
      setActiveSection(next)
    }
    main.addEventListener('scroll', updateActiveSection, { passive: true })
    updateActiveSection()
    return () => main.removeEventListener('scroll', updateActiveSection)
  }, [])

  const navigate = useCallback((section: WorkspaceSection) => {
    const targetId =
      section === 'home'
        ? 'home'
        : section === 'plugins'
          ? 'plugins'
          : section === 'agent'
            ? 'agent-workspace'
            : 'runtime-bridge'
    setActiveSection(section)
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleRuntimeState = useCallback(
    (snapshot: Readonly<RuntimeSnapshot>, events: readonly Readonly<RuntimeEvent>[]) => {
      setRuntimeSnapshot(snapshot)
      setRuntimeEvents(events)
    },
    [],
  )

  async function signIn(): Promise<void> {
    setAuthState('waiting')
    setAuthError('')
    try {
      const startResponse = await fetch(`${apiUrl}/auth/github/desktop/start`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      if (!startResponse.ok) {
        throw new Error(t('auth.serviceUnavailableBody'))
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
          throw new Error(t('auth.loginFailedTryAgain'))
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
      setAuthError(reason instanceof Error ? reason.message : t('auth.loginFailedTryAgain'))
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

  const activeTitle =
    activeSection === 'home'
      ? t('nav.home')
      : activeSection === 'plugins'
        ? t('nav.plugins')
        : activeSection === 'agent'
          ? t('nav.agent')
          : t('nav.runtime')

  return (
    <div className="desktop-shell">
      <WorkspaceSidebar
        active={activeSection}
        onNavigate={navigate}
        runtimeConnected={runtimeSnapshot?.connection === 'CONNECTED'}
        showDevelopmentDetails={showDevelopmentDetails}
      />

      <main className="desktop-main" id="workspace-main" ref={mainRef}>
        <header className="desktop-toolbar">
          <div>
            <span>{t('desktop.toolbarLabel')}</span>
            <strong>{activeTitle}</strong>
          </div>
          <div className="desktop-toolbar-runtime">
            <span className={runtimeSnapshot?.connection === 'CONNECTED' ? 'connected' : undefined} aria-hidden="true" />
            {runtimeSnapshot?.connection === 'CONNECTED'
              ? t('desktop.runtimeOnline')
              : t('desktop.runtimeOffline')}
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

        {authError ? (
          <aside className="desktop-auth-notice" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>{t('auth.serviceUnavailableTitle')}</strong>
              <p>{authError}</p>
            </div>
            <button onClick={() => void signIn()} type="button">{t('auth.retry')}</button>
            <button aria-label={t('auth.dismiss')} onClick={() => { setAuthError(''); setAuthState('idle') }} type="button">×</button>
          </aside>
        ) : null}

        <section className="desktop-content">
          <WorkspaceDashboard
            environment={runtimeEnvironment}
            onNavigate={navigate}
            plugin={plugins[0] ?? null}
            runtime={runtimeSnapshot}
            runtimeEvents={runtimeEvents}
          />

          <AgentWorkspace
            environment={runtimeEnvironment}
            events={runtimeEvents}
            runtime={runtimeSnapshot}
            showDevelopmentDetails={showDevelopmentDetails}
          />

          <RuntimeBridgePanel
            onStateChange={handleRuntimeState}
            showDevelopmentDetails={showDevelopmentDetails}
          />

          <DesktopMarketplace error={registryError} loading={registryLoading} plugins={plugins} />

          <RuntimeIntegrationPanel onSnapshot={setRuntimeEnvironment} />
          <InstallationPrototypePanel auth={auth} runtimeEnvironment={runtimeEnvironment} />
        </section>
      </main>
    </div>
  )
}
