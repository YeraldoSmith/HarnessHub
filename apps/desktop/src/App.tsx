import { useCallback, useEffect, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'

import { LanguageSelect, useI18n } from '@harnesshub/i18n'
import {
  authSessionResponseSchema,
  desktopOAuthStartResponseSchema,
  desktopSessionExchangeResponseSchema,
} from '@harnesshub/plugin-schema'
import type { Announcement, AuthSessionResponse, Plugin } from '@harnesshub/types'
import { IdentityBadge } from '@harnesshub/ui'
import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'
import type { RuntimeEnvironmentSnapshot } from '@harnesshub/runtime-integration'

import { AgentWorkspace } from './agent-workspace.js'
import { AnnouncementCenter } from './announcement-center.js'
import {
  defaultRemoteConfig,
  loadAnnouncements,
  loadRemoteConfig,
} from './control-plane.js'
import { DesktopMarketplace } from './marketplace.js'
import { ManagedRuntimePanel } from './managed-runtime-panel.js'
import { ManagedRuntimeSetup } from './managed-runtime-setup.js'
import { ProductPages } from './product-pages.js'
import {
  DesktopApiUnavailableError,
  fetchDesktopApi,
  loadDesktopRegistry,
} from './registry-client.js'
import {
  deleteSessionToken,
  emptyManagedRuntime,
  getManagedRuntimeStatus,
  listInstallationAudit,
  loadSessionToken,
  openManagedRuntimeWorkspace,
  saveSessionToken,
  type InstallationAuditRecord,
  type ManagedRuntimeStatus,
} from './native-runtime.js'
import {
  WorkspaceDashboard,
  WorkspaceSidebar,
  type WorkspaceSection,
} from './workspace-shell.js'

const showDevelopmentDetails = import.meta.env.DEV

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function App() {
  const { t } = useI18n()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [registryLoading, setRegistryLoading] = useState(true)
  const [registryError, setRegistryError] = useState('')
  const [registryNotice, setRegistryNotice] = useState('')
  const [authError, setAuthError] = useState('')
  const [auth, setAuth] = useState<AuthSessionResponse>({ authenticated: false })
  const [authState, setAuthState] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [runtimeEnvironment, setRuntimeEnvironment] = useState<RuntimeEnvironmentSnapshot | null>(null)
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<Readonly<RuntimeSnapshot> | null>(null)
  const [runtimeEvents, setRuntimeEvents] = useState<readonly Readonly<RuntimeEvent>[]>([])
  const [managedRuntime, setManagedRuntime] = useState<ManagedRuntimeStatus>(emptyManagedRuntime)
  const [installationAudit, setInstallationAudit] = useState<InstallationAuditRecord[]>([])
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('home')
  const [controlConfig, setControlConfig] = useState(defaultRemoteConfig)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const apiBaseUrl = controlConfig.services.api_url || undefined

  useEffect(() => {
    let active = true
    void loadRemoteConfig().then(async (config) => {
      if (!active) return
      setControlConfig(config)
      const loadedAnnouncements = await loadAnnouncements(config)
      if (active) setAnnouncements(loadedAnnouncements)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void loadDesktopRegistry(undefined, apiBaseUrl)
      .then((result) => {
        if (!active) return
        setPlugins(result.registry.items)
        setRegistryError('')
        setRegistryNotice(result.source === 'BUNDLED' ? t('desktop.registrySnapshotNotice') : '')
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
  }, [apiBaseUrl, t])

  const refreshAudit = useCallback(() => {
    void listInstallationAudit().then(setInstallationAudit).catch(() => undefined)
  }, [])

  useEffect(() => {
    void getManagedRuntimeStatus().then(setManagedRuntime).catch(() => undefined)
    refreshAudit()
  }, [refreshAudit])

  useEffect(() => {
    let active = true
    void loadSessionToken()
      .then(async (token) => {
        if (!token) return
        const response = await fetchDesktopApi('/auth/session', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }, 5000, apiBaseUrl)
        if (!response.ok) throw new Error('saved session is unavailable')
        const session = authSessionResponseSchema.parse(await response.json())
        if (!active) return
        if (session.authenticated) {
          setSessionToken(token)
          setAuth(session)
        } else {
          await deleteSessionToken()
        }
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [apiBaseUrl, controlConfig.features.github_login])

  const navigate = useCallback((section: WorkspaceSection) => {
    setActiveSection(section)
    document.getElementById('workspace-main')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  const handleRuntimeState = useCallback(
    (snapshot: Readonly<RuntimeSnapshot>, events: readonly Readonly<RuntimeEvent>[]) => {
      setRuntimeSnapshot(snapshot)
      setRuntimeEvents(events)
    },
    [],
  )

  async function signIn(): Promise<void> {
    if (!controlConfig.features.github_login) return
    setAuthState('waiting')
    setAuthError('')
    try {
      const startResponse = await fetchDesktopApi('/auth/github/desktop/start', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      }, 5000, apiBaseUrl)
      if (!startResponse.ok) {
        throw new Error(t('auth.serviceUnavailableBody'))
      }
      const started = desktopOAuthStartResponseSchema.parse(await startResponse.json())
      await openUrl(started.authorization_url)

      while (Date.now() < Date.parse(started.expires_at)) {
        await wait(1500)
        const exchangeResponse = await fetchDesktopApi('/auth/github/desktop/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            transaction_id: started.transaction_id,
            poll_token: started.poll_token,
          }),
        }, 5000, apiBaseUrl)
        if (!exchangeResponse.ok) {
          throw new Error(t('auth.loginFailedTryAgain'))
        }
        const exchange = desktopSessionExchangeResponseSchema.parse(await exchangeResponse.json())
        if (exchange.status === 'COMPLETE') {
          await saveSessionToken(exchange.session_token)
          const savedToken = await loadSessionToken()
          if (savedToken !== exchange.session_token) throw new Error(t('auth.loginFailedTryAgain'))
          setSessionToken(exchange.session_token)
          setAuth(exchange.session)
          setAuthState('idle')
          return
        }
      }
      throw new Error(t('auth.loginExpired'))
    } catch (reason) {
      setAuthState('error')
      setAuthError(reason instanceof DesktopApiUnavailableError
        ? t('auth.serviceUnavailableBody')
        : reason instanceof Error ? reason.message : t('auth.loginFailedTryAgain'))
    }
  }

  async function signOut(): Promise<void> {
    if (sessionToken) {
      await fetchDesktopApi('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }, 5000, apiBaseUrl).catch(() => undefined)
    }
    setSessionToken(null)
    await deleteSessionToken().catch(() => undefined)
    setAuth({ authenticated: false })
    setAuthState('idle')
  }

  const activeTitle =
    activeSection === 'home'
      ? t('nav.home')
      : activeSection === 'plugins'
        ? t('nav.plugins')
        : activeSection === 'agent' ? t('nav.agent')
          : activeSection === 'runtime' ? t('nav.runtime')
            : activeSection === 'tasks' ? t('nav.tasks')
              : activeSection === 'account' ? t('nav.account')
                : t('nav.settings')

  return (
    <div className="desktop-shell">
      <WorkspaceSidebar
        active={activeSection}
        onNavigate={navigate}
        runtimeConnected={runtimeSnapshot?.connection === 'CONNECTED'}
        showDevelopmentDetails={showDevelopmentDetails}
      />

      <main className="desktop-main" id="workspace-main">
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
            ) : controlConfig.features.github_login ? (
              <button disabled={authState === 'waiting'} onClick={() => void signIn()} type="button">
                {authState === 'waiting' ? t('auth.waiting') : t('auth.signIn')}
              </button>
            ) : <span className="desktop-guest-mode">{t('auth.guestMode')}</span>}
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

        {controlConfig.ui.notice ? <aside className="control-plane-notice">{controlConfig.ui.notice}</aside> : null}
        <AnnouncementCenter announcements={announcements} />

        <section className="desktop-content" key={activeSection}>
          {activeSection === 'home' ? <WorkspaceDashboard
            environment={runtimeEnvironment}
            onNavigate={navigate}
            plugin={plugins[0] ?? null}
            runtime={runtimeSnapshot}
            runtimeEvents={runtimeEvents}
          /> : null}

          {activeSection === 'agent' ? <AgentWorkspace
            environment={runtimeEnvironment}
            events={runtimeEvents}
            runtime={runtimeSnapshot}
            runtimeUrl={managedRuntime.url}
            showDevelopmentDetails={showDevelopmentDetails}
          /> : null}

          {activeSection === 'runtime' ? <><ManagedRuntimePanel
            onAuditChange={refreshAudit}
            onRuntimeChange={setManagedRuntime}
            onStateChange={handleRuntimeState}
            runtime={managedRuntime}
          /><ManagedRuntimeSetup
            onAuditChange={refreshAudit}
            onEnvironment={setRuntimeEnvironment}
            onRuntimeChange={setManagedRuntime}
            runtime={managedRuntime}
          /></> : null}

          {activeSection === 'plugins' ? <DesktopMarketplace
            auth={auth}
            error={registryError}
            loading={registryLoading}
            notice={registryNotice}
            onAuditChange={refreshAudit}
            onRuntimeChange={setManagedRuntime}
            plugins={plugins}
            runtime={managedRuntime}
          /> : null}

          {activeSection === 'tasks' || activeSection === 'account' || activeSection === 'settings' ? <ProductPages
            page={activeSection}
            audit={installationAudit}
            auth={auth}
            authPending={authState === 'waiting'}
            loginEnabled={controlConfig.features.github_login}
            onSignIn={() => void signIn()}
            onSignOut={() => void signOut()}
            onOpenWorkspace={() => void openManagedRuntimeWorkspace().catch(() => undefined)}
            runtime={managedRuntime}
          /> : null}
        </section>
      </main>
    </div>
  )
}
