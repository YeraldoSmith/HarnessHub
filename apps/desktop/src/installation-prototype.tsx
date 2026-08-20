import { useEffect, useMemo, useState } from 'react'

import { type TranslationKey, useI18n } from '@harnesshub/i18n'
import {
  InstallationAuthorizationError,
  MockEnvironmentManager,
  MockInstallationEngine,
  permissionReviewAgentManifest,
  type InstallationActor,
  type InstallationAuditEvent,
  type InstallationStatus,
  type InstallationTransaction,
  type MockInstallationManifest,
  type PrototypePermissionId,
  type PrototypeRiskLevel,
  type SimulationScenario,
} from '@harnesshub/installation-prototype'
import type { AuthSessionResponse } from '@harnesshub/types'
import {
  ControlledRuntimeInstallationEnvironment,
  type RuntimeEnvironmentSnapshot,
} from '@harnesshub/runtime-integration'

const permissionLabelKeys: Record<PrototypePermissionId, TranslationKey> = {
  'network-access': 'installation.permissionNetworkAccess',
  'project-file-read': 'installation.permissionProjectFileRead',
  'project-file-write': 'installation.permissionProjectFileWrite',
  'shell-execution': 'installation.permissionShellExecution',
  'browser-control': 'installation.permissionBrowserControl',
  'environment-access': 'installation.permissionEnvironmentAccess',
  'install-time-code': 'installation.permissionInstallTimeCode',
}

const permissionReasonKeys: Record<PrototypePermissionId, TranslationKey> = {
  'network-access': 'installation.reasonNetworkAccess',
  'project-file-read': 'installation.reasonProjectFileRead',
  'project-file-write': 'installation.reasonProjectFileWrite',
  'shell-execution': 'installation.reasonShellExecution',
  'browser-control': 'installation.reasonBrowserControl',
  'environment-access': 'installation.reasonEnvironmentAccess',
  'install-time-code': 'installation.reasonInstallTimeCode',
}

const riskKeys: Record<PrototypeRiskLevel, TranslationKey> = {
  LOW: 'installation.riskLow',
  MEDIUM: 'installation.riskMedium',
  HIGH: 'installation.riskHigh',
  CRITICAL: 'installation.riskCritical',
}

const statusKeys: Record<InstallationStatus, TranslationKey> = {
  REQUESTED: 'installation.statusRequested',
  ANALYZING: 'installation.statusAnalyzing',
  WAITING_CONFIRMATION: 'installation.statusWaitingConfirmation',
  INSTALLING_SIMULATED: 'installation.statusInstallingSimulated',
  VERIFYING: 'installation.statusVerifying',
  INSTALLED: 'installation.statusInstalled',
  CANCELLED: 'installation.statusCancelled',
  FAILED: 'installation.statusFailed',
  ROLLING_BACK: 'installation.statusRollingBack',
  ROLLED_BACK: 'installation.statusRolledBack',
  RECOVERY_REQUIRED: 'installation.statusRecoveryRequired',
}

const terminalStatuses = new Set<InstallationStatus>([
  'INSTALLED',
  'CANCELLED',
  'ROLLED_BACK',
  'RECOVERY_REQUIRED',
])

function resultKey(status: InstallationStatus): TranslationKey | null {
  if (status === 'INSTALLED') return 'installation.resultInstalled'
  if (status === 'CANCELLED') return 'installation.resultCancelled'
  if (status === 'ROLLED_BACK') return 'installation.resultRolledBack'
  if (status === 'RECOVERY_REQUIRED') return 'installation.resultRecoveryRequired'
  return null
}

export function InstallationPermissionReview({ manifest }: { manifest: MockInstallationManifest }) {
  const { t } = useI18n()
  return (
    <div className="installation-review">
      <div className="installation-plugin-summary">
        <div>
          <span>{t('installation.pluginLabel')}</span>
          <strong>{manifest.pluginName}</strong>
        </div>
        <div>
          <span>{t('installation.versionLabel')}</span>
          <strong>{manifest.version}</strong>
        </div>
      </div>

      <div className="installation-permissions">
        <h3>{t('installation.permissionsTitle')}</h3>
        {manifest.permissions.map((permission) => {
          const highAttention = permission.permissionId === 'install-time-code' || permission.riskLevel === 'HIGH'
          return (
            <article
              className={highAttention ? 'installation-permission installation-permission--warning' : 'installation-permission'}
              key={permission.permissionId}
            >
              <span className="installation-permission-icon" aria-hidden="true">
                {highAttention ? '!' : '✓'}
              </span>
              <div>
                <strong>{t(permissionLabelKeys[permission.permissionId])}</strong>
                <p>{t(permissionReasonKeys[permission.permissionId])}</p>
                <small>{t('installation.scopeLabel', { scope: permission.scope })}</small>
              </div>
            </article>
          )
        })}
      </div>

      <div className={`installation-risk installation-risk--${manifest.riskLevel.toLowerCase()}`}>
        <span>{t('installation.riskLevel')}</span>
        <strong>{t(riskKeys[manifest.riskLevel])}</strong>
        <p>
          <b>{t('installation.riskReasonLabel')}：</b>
          {t('installation.riskReason')}
        </p>
      </div>
    </div>
  )
}

function AuditTimeline({ events }: { events: readonly Readonly<InstallationAuditEvent>[] }) {
  const { t } = useI18n()
  return (
    <div className="installation-audit">
      <h3>{t('installation.auditTitle')}</h3>
      {events.length === 0 ? <p>{t('installation.auditEmpty')}</p> : null}
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <span className={`installation-audit-dot installation-audit-dot--${event.result.toLowerCase()}`} />
            <div>
              <strong>{t(statusKeys[event.toStatus])}</strong>
              <small>{new Date(event.timestamp).toLocaleTimeString()}</small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function InstallationPrototypePanel({
  auth,
  runtimeEnvironment,
}: {
  auth: AuthSessionResponse
  runtimeEnvironment?: RuntimeEnvironmentSnapshot | null
}) {
  const { t } = useI18n()
  const engine = useMemo(
    () =>
      new MockInstallationEngine(
        permissionReviewAgentManifest,
        runtimeEnvironment
          ? new ControlledRuntimeInstallationEnvironment(runtimeEnvironment)
          : new MockEnvironmentManager(),
      ),
    [runtimeEnvironment],
  )
  const [transaction, setTransaction] = useState<Readonly<InstallationTransaction> | null>(null)
  const [audit, setAudit] = useState<readonly Readonly<InstallationAuditEvent>[]>([])
  const [scenario, setScenario] = useState<SimulationScenario>('SUCCESS')
  const [error, setError] = useState('')

  useEffect(() => {
    setTransaction(null)
    setAudit([])
    setError('')
  }, [engine])

  const actor: InstallationActor | null = auth.authenticated ? { userId: auth.user.id } : null

  function update(next: Readonly<InstallationTransaction>, nextActor: InstallationActor): void {
    setTransaction(next)
    setAudit(engine.getAudit(nextActor, next.id))
  }

  function startSimulation(): void {
    if (!actor) {
      setError(t('installation.unauthorized'))
      return
    }
    setError('')
    try {
      const requested = engine.request(actor)
      update(engine.analyze(actor, requested.id), actor)
    } catch (reason) {
      setError(
        reason instanceof InstallationAuthorizationError
          ? t('installation.unauthorized')
          : reason instanceof Error
            ? reason.message
            : t('installation.unauthorized'),
      )
    }
  }

  function confirmSimulation(): void {
    if (!actor || !transaction) {
      setError(t('installation.unauthorized'))
      return
    }
    try {
      update(engine.run(actor, transaction.id, scenario), actor)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('installation.unauthorized'))
    }
  }

  function cancelSimulation(): void {
    if (!actor || !transaction) {
      setError(t('installation.unauthorized'))
      return
    }
    try {
      update(engine.cancel(actor, transaction.id), actor)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('installation.unauthorized'))
    }
  }

  const resultMessage = transaction ? resultKey(transaction.status) : null

  return (
    <section className="installation-prototype" id="installation-prototype">
      <div className="installation-prototype-heading">
        <div>
          <span>{t('installation.prototypeBadge')}</span>
          <h2>{t('installation.title')}</h2>
        </div>
        <p>{t('installation.description')}</p>
      </div>

      <div className="installation-simulation-notice" role="note">
        <span aria-hidden="true">◇</span>
        <strong>{t('installation.simulationOnly')}</strong>
      </div>

      {runtimeEnvironment ? (
        <p className="installation-runtime-connection">
          {t('runtime.connectedEnvironment', {
            platform: runtimeEnvironment.platform,
            arch: runtimeEnvironment.architecture,
            dsh: runtimeEnvironment.dsh.version ?? t('runtime.statusMissing'),
          })}
        </p>
      ) : null}

      {!auth.authenticated ? (
        <div className="installation-auth-gate">
          <span aria-hidden="true">🔒</span>
          <div>
            <h3>{t('installation.signInTitle')}</h3>
            <p>{t('installation.signInBody')}</p>
          </div>
        </div>
      ) : null}

      {auth.authenticated && !transaction ? (
        <button className="installation-primary-action" onClick={startSimulation} type="button">
          {t('installation.start')}
        </button>
      ) : null}

      {auth.authenticated && transaction ? (
        <div className="installation-prototype-grid">
          <div>
            <InstallationPermissionReview manifest={engine.manifest} />

            {transaction.status === 'WAITING_CONFIRMATION' ? (
              <div className="installation-confirmation">
                <fieldset>
                  <legend>{t('installation.scenarioTitle')}</legend>
                  <label>
                    <input
                      checked={scenario === 'SUCCESS'}
                      name="simulation-scenario"
                      onChange={() => setScenario('SUCCESS')}
                      type="radio"
                    />
                    {t('installation.scenarioSuccess')}
                  </label>
                  <label>
                    <input
                      checked={scenario === 'FAIL_ROLLBACK_SUCCESS'}
                      name="simulation-scenario"
                      onChange={() => setScenario('FAIL_ROLLBACK_SUCCESS')}
                      type="radio"
                    />
                    {t('installation.scenarioRollback')}
                  </label>
                  <label>
                    <input
                      checked={scenario === 'FAIL_ROLLBACK_FAILURE'}
                      name="simulation-scenario"
                      onChange={() => setScenario('FAIL_ROLLBACK_FAILURE')}
                      type="radio"
                    />
                    {t('installation.scenarioRecovery')}
                  </label>
                </fieldset>
                <div className="installation-actions">
                  <button className="installation-secondary-action" onClick={cancelSimulation} type="button">
                    {t('installation.cancel')}
                  </button>
                  <button className="installation-primary-action" onClick={confirmSimulation} type="button">
                    {t('installation.confirm')}
                  </button>
                </div>
              </div>
            ) : null}

            {resultMessage ? (
              <div
                className={
                  transaction.status === 'RECOVERY_REQUIRED'
                    ? 'installation-result installation-result--danger'
                    : 'installation-result'
                }
                role="status"
              >
                <strong>{t(statusKeys[transaction.status])}</strong>
                <p>{t(resultMessage)}</p>
              </div>
            ) : null}

            {terminalStatuses.has(transaction.status) ? (
              <button className="installation-new-action" onClick={startSimulation} type="button">
                {t('installation.newSimulation')}
              </button>
            ) : null}
          </div>

          <aside>
            <div className="installation-current-status">
              <span>{t('installation.statusTitle')}</span>
              <strong>{t(statusKeys[transaction.status])}</strong>
              <small>{t('installation.auditActor', { actor: auth.user.github.login ?? auth.user.github.user_id })}</small>
            </div>
            <AuditTimeline events={audit} />
          </aside>
        </div>
      ) : null}

      {error ? <p className="installation-prototype-error">{error}</p> : null}
    </section>
  )
}
