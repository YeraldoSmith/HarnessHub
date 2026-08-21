import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '@harnesshub/i18n'
import type { AuthSessionResponse, Plugin } from '@harnesshub/types'
import { permissionLabelKeys } from '@harnesshub/ui'

import {
  installableEvidence,
  installManagedPlugin,
  managedPluginForRegistryEntry,
  nativeAvailable,
  pluginInstallationPolicy,
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
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const evidence = useMemo(() => installableEvidence(plugin), [plugin])
  const policy = useMemo(() => pluginInstallationPolicy(plugin), [plugin])
  const installed = managedPluginForRegistryEntry(plugin, runtime.plugins)
  const canResolveFromGitHub = Boolean(plugin.github_url)
  const current = Boolean(installed && (!evidence || installed.version === evidence.version))

  useEffect(() => {
    setConfirmed(false)
    setHighRiskConfirmed(false)
    setMessage('')
    setError('')
  }, [plugin.id])

  async function operate(action: 'install' | 'remove'): Promise<void> {
    setPending(true)
    setMessage('')
    setError('')
    try {
      const result = action === 'install'
        ? await installManagedPlugin(plugin, confirmed ? 1 + (highRiskConfirmed ? 1 : 0) : 0)
        : await removeManagedPlugin(plugin, installed?.packageName ?? '')
      onRuntimeChange(result.runtime)
      onAuditChange()
      setMessage(result.message)
      setConfirmed(false)
      setHighRiskConfirmed(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      onAuditChange()
    } finally {
      setPending(false)
    }
  }

  const blocked = !nativeAvailable() || !runtime.prepared || (!evidence && !installed && !canResolveFromGitHub)

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
            : evidence
              ? t('managedInstall.availableRisk', { version: evidence.version, risk: policy.riskLevel })
              : canResolveFromGitHub
                ? t('managedInstall.candidateResolvable')
                : t('managedInstall.candidatePending')}
        </strong>
      </header>

      {!nativeAvailable() ? <p className="managed-install__notice">{t('managedInstall.notDesktop')}</p> : null}
      {nativeAvailable() && !auth.authenticated ? <p className="managed-install__notice">{t('managedInstall.guestLocal')}</p> : null}
      {nativeAvailable() && !runtime.prepared ? <p className="managed-install__notice">{t('managedInstall.runtimeRequired')}</p> : null}
      {plugin.registry_status === 'COLLECTED_UNVERIFIED' ? (
        <p className="managed-install__notice">{t('managedInstall.candidateRiskNotice')}</p>
      ) : null}
      {installed?.enabled === false ? (
        <p className="managed-install__notice managed-install__notice--error">
          {t('managedInstall.disabledRepair', { reason: installed.issue ?? t('managedInstall.sourceChanged') })}
        </p>
      ) : null}
      {!evidence ? <p className={`managed-install__notice${canResolveFromGitHub ? '' : ' managed-install__notice--error'}`}>
        {t(canResolveFromGitHub ? 'managedInstall.sourceResolution' : 'managedInstall.unavailable')}
      </p> : null}

      {evidence ? (
        <div className="managed-install__evidence">
          <span>{t('managedInstall.package', { package: evidence.packageName })}</span>
          <span>{t('managedInstall.integrity')}</span>
          <span>{t('managedInstall.snapshot', { hash: plugin.discovery_snapshot_sha256?.slice(0, 12) ?? 'Registry' })}</span>
        </div>
      ) : null}

      {plugin.permissions.length > 0 ? (
        <div className="managed-install__permissions">
          <strong>{t('managedInstall.permissionsTitle')}</strong>
          <ul>{plugin.permissions.map((permission) => (
            <li key={permission.id}>{t(permissionLabelKeys[permission.id])} · {permission.risk.toUpperCase()}</li>
          ))}</ul>
        </div>
      ) : null}

      {!blocked ? (
        <>
          <label className="managed-install__confirm">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>{t(policy.riskLevel === 'LOW' ? 'managedInstall.confirmLow' : 'managedInstall.confirmPermissions')}</span>
          </label>
          {policy.requiredConfirmations === 2 ? (
            <label className="managed-install__confirm managed-install__confirm--high">
              <input
                checked={highRiskConfirmed}
                onChange={(event) => setHighRiskConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>{t('managedInstall.confirmHigh')}</span>
            </label>
          ) : null}
          <div className="managed-install__actions">
            {!current && (evidence || canResolveFromGitHub) ? (
              <button
                disabled={!confirmed || (policy.requiredConfirmations === 2 && !highRiskConfirmed) || pending}
                onClick={() => void operate('install')}
                type="button"
              >
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
