import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '@harnesshub/i18n'
import type { AuthSessionResponse, Plugin } from '@harnesshub/types'

import {
  installableEvidence,
  installManagedPlugin,
  nativeAvailable,
  removeManagedPlugin,
  type ManagedRuntimeStatus,
} from './native-runtime.js'

interface ManagedPluginInstallProps {
  auth: AuthSessionResponse
  plugin: Plugin
  runtime: ManagedRuntimeStatus
  onRuntimeChange(runtime: ManagedRuntimeStatus): void
  onAuditChange(): void
}

export function ManagedPluginInstall({
  auth,
  plugin,
  runtime,
  onRuntimeChange,
  onAuditChange,
}: ManagedPluginInstallProps) {
  const { t } = useI18n()
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const evidence = useMemo(() => installableEvidence(plugin), [plugin])
  const installed = runtime.plugins.find((record) => record.pluginId === plugin.id) ?? null
  const current = installed?.version === evidence?.version

  useEffect(() => {
    setConfirmed(false)
    setMessage('')
    setError('')
  }, [plugin.id])

  async function operate(action: 'install' | 'remove'): Promise<void> {
    setPending(true)
    setMessage('')
    setError('')
    try {
      const result = action === 'install'
        ? await installManagedPlugin(plugin)
        : await removeManagedPlugin(plugin)
      onRuntimeChange(result.runtime)
      onAuditChange()
      setMessage(result.message)
      setConfirmed(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      onAuditChange()
    } finally {
      setPending(false)
    }
  }

  const blocked = !nativeAvailable() || !auth.authenticated || !runtime.prepared || !evidence

  return (
    <section className="managed-install" aria-labelledby={`install-${plugin.id}`}>
      <header>
        <div>
          <h3 id={`install-${plugin.id}`}>{t('managedInstall.title')}</h3>
          <p>{t('managedInstall.subtitle')}</p>
        </div>
        <strong className={installed ? 'installed' : undefined}>
          {installed
            ? t('managedInstall.installed', { version: installed.version })
            : t('managedInstall.available', { version: evidence?.version ?? plugin.version })}
        </strong>
      </header>

      {!nativeAvailable() ? <p className="managed-install__notice">{t('managedInstall.notDesktop')}</p> : null}
      {nativeAvailable() && !auth.authenticated ? <p className="managed-install__notice">{t('managedInstall.signIn')}</p> : null}
      {nativeAvailable() && auth.authenticated && !runtime.prepared ? <p className="managed-install__notice">{t('managedInstall.runtimeRequired')}</p> : null}
      {!evidence ? <p className="managed-install__notice managed-install__notice--error">{t('managedInstall.unavailable')}</p> : null}

      {evidence ? (
        <div className="managed-install__evidence">
          <span>{t('managedInstall.package', { package: evidence.packageName })}</span>
          <span>{t('managedInstall.integrity')}</span>
        </div>
      ) : null}

      {!blocked ? (
        <>
          <label className="managed-install__confirm">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>{t('managedInstall.confirmLabel')}</span>
          </label>
          <div className="managed-install__actions">
            {!current ? (
              <button disabled={!confirmed || pending} onClick={() => void operate('install')} type="button">
                {pending ? t('managedInstall.working') : installed ? t('managedInstall.update') : t('managedInstall.install')}
              </button>
            ) : null}
            {installed ? (
              <button className="danger" disabled={!confirmed || pending} onClick={() => void operate('remove')} type="button">
                {t('managedInstall.remove')}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {runtime.running && installed ? <p className="managed-install__restart">{t('managedInstall.restart')}</p> : null}
      {message ? <p className="managed-install__result" role="status">{message}</p> : null}
      {error ? <p className="managed-install__result managed-install__result--error" role="alert">{t('managedInstall.failed')} {error}</p> : null}
    </section>
  )
}
