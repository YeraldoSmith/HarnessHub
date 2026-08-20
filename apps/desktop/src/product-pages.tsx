import { useState } from 'react'

import { LanguageSelect, ThemeSelect, useI18n } from '@harnesshub/i18n'
import type { AuthSessionResponse } from '@harnesshub/types'
import { IdentityBadge } from '@harnesshub/ui'

import type { InstallationAuditRecord, ManagedRuntimeStatus } from './native-runtime.js'

export type ProductPageKind = 'tasks' | 'account' | 'settings'

interface ProductPagesProps {
  page: ProductPageKind
  auth: AuthSessionResponse
  audit: InstallationAuditRecord[]
  runtime: ManagedRuntimeStatus
  authPending: boolean
  loginEnabled: boolean
  onSignIn(): void
  onSignOut(): void
  onOpenWorkspace(): void
}

export function ProductPages({
  page,
  auth,
  audit,
  runtime,
  authPending,
  loginEnabled,
  onSignIn,
  onSignOut,
  onOpenWorkspace,
}: ProductPagesProps) {
  const { t } = useI18n()
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'about'>('general')

  if (page === 'tasks') {
    return (
      <section className="product-page workspace-section" id="tasks">
        <header><span>{t('nav.tasks')}</span><h2>{t('productPages.tasksTitle')}</h2><p>{t('productPages.tasksBody')}</p></header>
        {audit.length === 0 ? <div className="product-page__empty">{t('productPages.tasksEmpty')}</div> : (
          <ol className="task-audit-list">
            {audit.map((event) => (
              <li key={event.id}>
                <span className={`task-audit-list__result task-audit-list__result--${event.result.toLowerCase()}`} />
                <div><strong>{event.action.replaceAll('_', ' ')}</strong><p>{event.message}</p><small>{event.packageName ?? 'DSH'} {event.version ?? ''}</small></div>
                <time>{new Date(event.timestampUnixMs).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    )
  }

  if (page === 'account') {
    return (
      <section className="product-page workspace-section" id="account">
        <header><span>{t('nav.account')}</span><h2>{t('productPages.accountTitle')}</h2><p>{t('productPages.accountBody')}</p></header>
        <article className="account-card">
          {auth.authenticated ? (
            <>
              <div className="account-card__avatar">{(auth.user.github.login ?? 'G').slice(0, 1).toUpperCase()}</div>
              <div><strong>{auth.user.github.login ?? auth.user.public_id}</strong><small>{auth.user.public_id} · GitHub ID {auth.user.github.user_id}</small></div>
              <div className="account-card__badges">
                {auth.user.badges.includes('FOUNDER') ? <IdentityBadge kind="founder" /> : null}
                {auth.user.badges.includes('EARLY_USER') ? <IdentityBadge kind="early-user" /> : null}
                {auth.user.badges.includes('BETA_TESTER') ? <IdentityBadge kind="beta-tester" /> : null}
              </div>
              <button onClick={onSignOut} type="button">{t('auth.signOut')}</button>
            </>
          ) : (
            <><div className="account-card__avatar">G</div><p>{t('productPages.guestAccount')}</p>{loginEnabled ? <button disabled={authPending} onClick={onSignIn} type="button">{authPending ? t('auth.waiting') : t('auth.signIn')}</button> : null}</>
          )}
        </article>
      </section>
    )
  }

  return (
    <section className="product-page workspace-section product-page--settings" id="settings">
      <header><span>{t('nav.settings')}</span><h2>{t('productPages.settingsTitle')}</h2><p>{t('productPages.settingsBody')}</p></header>
      <div className="settings-tabs" role="tablist">
        {(['general', 'appearance', 'about'] as const).map((tab) => <button aria-selected={settingsTab === tab} className={settingsTab === tab ? 'active' : undefined} key={tab} onClick={() => setSettingsTab(tab)} role="tab" type="button">{t(`productPages.${tab}`)}</button>)}
      </div>
      {settingsTab === 'general' ? (
        <div className="settings-grid">
          <article><span>{t('language.select')}</span><LanguageSelect /></article>
          <article><span>{t('productPages.managedProfile')}</span><strong>{t('productPages.profileValue')}</strong></article>
          <article><span>{t('productPages.toolchain')}</span><strong>{runtime.prepared ? t('productPages.toolchainValue') : t('runtimeSetup.willPrepare')}</strong></article>
          <article><span>{t('productPages.scripts')}</span><strong>{t('productPages.scriptsValue')}</strong></article>
          <article><span>{t('productPages.telemetry')}</span><strong>{t('productPages.telemetryValue')}</strong></article>
          <article><span>{t('productPages.localData')}</span><strong>{t('productPages.localDataValue')}</strong></article>
          <article className="settings-workspace"><span>{t('productPages.runtimeWorkspace')}</span><p>{t('productPages.runtimeWorkspaceBody')}</p><button disabled={!runtime.running} onClick={onOpenWorkspace} type="button">{t('agent.openWorkspace')}</button></article>
        </div>
      ) : null}
      {settingsTab === 'appearance' ? <div className="settings-grid"><article><span>{t('productPages.theme')}</span><ThemeSelect /></article><article><span>{t('language.select')}</span><LanguageSelect /></article></div> : null}
      {settingsTab === 'about' ? (
        <div className="about-card">
          <span aria-hidden="true">H</span><div><h3>HarnessHub</h3><p>{t('productPages.positioning')}</p><strong>{t('productPages.founder')}: YeraldoSmith</strong><small>{t('productPages.copyright')}</small></div>
          <section><h4>{t('productPages.termsTitle')}</h4><p>{t('productPages.termsBody')}</p></section>
        </div>
      ) : null}
    </section>
  )
}
