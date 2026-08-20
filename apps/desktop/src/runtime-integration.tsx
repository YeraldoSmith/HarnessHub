import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

import { useI18n } from '@harnesshub/i18n'
import {
  ControlledDshAdapter,
  evaluateTrustedInstallBoundary,
  RuntimeEnvironmentManager,
  type NativeRuntimeEnvironmentSnapshot,
  type ReadonlyEnvironmentProbe,
  type RuntimeEnvironmentSnapshot,
  type RuntimeSetupPlan,
  type RuntimeToolState,
} from '@harnesshub/runtime-integration'

class TauriReadonlyEnvironmentProbe implements ReadonlyEnvironmentProbe {
  async detect(): Promise<NativeRuntimeEnvironmentSnapshot> {
    if (!isTauri()) throw new Error('Runtime detection is available only inside the packaged desktop app.')
    return invoke<NativeRuntimeEnvironmentSnapshot>('detect_runtime_environment')
  }
}

function ToolStatus({ tool }: { tool: RuntimeToolState }) {
  const { t } = useI18n()
  const status =
    tool.status === 'AVAILABLE'
      ? t('runtime.statusAvailable')
      : tool.status === 'MISSING'
        ? t('runtime.statusMissing')
        : t('runtime.statusError')
  return (
    <article className={`runtime-tool runtime-tool--${tool.status.toLowerCase()}`}>
      <div>
        <strong>{tool.name}</strong>
        <span>{status}</span>
      </div>
      <p>{tool.version ?? t('runtime.versionUnknown')}</p>
      <small>{t('runtime.readOnlyProbe')}</small>
    </article>
  )
}

export function RuntimeSetupPlanReview({ plan }: { plan: RuntimeSetupPlan }) {
  const { t } = useI18n()
  const stepKeys = [
    ['runtime.stepPrepareDsh', 'runtime.stepPrepareDshBody'],
    ['runtime.stepCreateProfile', 'runtime.stepCreateProfileBody'],
    ['runtime.stepVerifyEnvironment', 'runtime.stepVerifyEnvironmentBody'],
  ] as const
  const permissionKeys = {
    NETWORK_DOWNLOAD: ['runtime.permissionNetwork', 'runtime.permissionNetworkBody'],
    USER_PROFILE_WRITE: ['runtime.permissionProfile', 'runtime.permissionProfileBody'],
    RUNTIME_EXECUTION: ['runtime.permissionRuntime', 'runtime.permissionRuntimeBody'],
  } as const

  return (
    <div className="runtime-plan">
      <div className="runtime-plan-notice" role="note">
        <strong>{t('runtime.planOnly')}</strong>
        <p>{t('runtime.planOnlyBody')}</p>
      </div>
      <h3>{t('runtime.plannedSteps')}</h3>
      <ol>
        {plan.steps.map((step, index) => (
          <li key={step.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{t(stepKeys[index]?.[0] ?? 'runtime.stepVerifyEnvironment')}</strong>
              <p>{t(stepKeys[index]?.[1] ?? 'runtime.stepVerifyEnvironmentBody')}</p>
              <small>{t('runtime.notExecutable')}</small>
            </div>
          </li>
        ))}
      </ol>
      <h3>{t('runtime.permissions')}</h3>
      <div className="runtime-plan-permissions">
        {plan.permissions.map((permission) => (
          <article key={permission.id}>
            <span aria-hidden="true">!</span>
            <div>
              <strong>{t(permissionKeys[permission.id][0])}</strong>
              <p>{t(permissionKeys[permission.id][1])}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

interface RuntimeIntegrationPanelProps {
  onSnapshot(snapshot: RuntimeEnvironmentSnapshot): void
  probe?: ReadonlyEnvironmentProbe
}

export function RuntimeIntegrationPanel({ onSnapshot, probe }: RuntimeIntegrationPanelProps) {
  const { t } = useI18n()
  const started = useRef(false)
  const manager = useMemo(
    () => new RuntimeEnvironmentManager(probe ?? new TauriReadonlyEnvironmentProbe()),
    [probe],
  )
  const dshAdapter = useMemo(() => new ControlledDshAdapter(), [])
  const [environment, setEnvironment] = useState<RuntimeEnvironmentSnapshot | null>(null)
  const [plan, setPlan] = useState<RuntimeSetupPlan | null>(null)
  const [state, setState] = useState<'idle' | 'detecting' | 'ready' | 'error' | 'confirmed'>('idle')
  const [error, setError] = useState('')

  const detect = useCallback(async () => {
    setState('detecting')
    setError('')
    setPlan(null)
    try {
      const next = await manager.detect()
      setEnvironment(next)
      onSnapshot(next)
      setState('ready')
    } catch {
      setState('error')
      setError(isTauri() ? t('runtime.detectionFailed') : t('runtime.packagedOnly'))
    }
  }, [manager, onSnapshot, t])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void detect()
  }, [detect])

  function preparePlan(): void {
    if (!environment) return
    setPlan(dshAdapter.prepareInstallPlan(environment))
    setState('ready')
  }

  function confirmPlan(): void {
    if (!plan) return
    setState('confirmed')
  }

  const compatibility = environment ? dshAdapter.checkCompatibility(environment) : null
  const trustBoundary = evaluateTrustedInstallBoundary({
    officialTestPlugin: true,
    riskLevel: 'LOW',
    completeManifest: true,
    verifiedDeveloper: true,
  })

  return (
    <section className="runtime-integration" id="runtime-integration">
      <div className="runtime-heading">
        <div>
          <span>{t('runtime.phase')}</span>
          <h2>{t('runtime.title')}</h2>
        </div>
        <p>{t('runtime.description')}</p>
      </div>

      <div className="runtime-readonly-notice" role="note">
        <span aria-hidden="true">◇</span>
        <div>
          <strong>{t('runtime.readOnlyTitle')}</strong>
          <p>{t('runtime.readOnlyBody')}</p>
        </div>
      </div>

      {state === 'detecting' ? <p className="runtime-message">{t('runtime.detecting')}</p> : null}
      {error ? (
        <div className="runtime-message runtime-message--error">
          <p>{error}</p>
          <button onClick={() => void detect()} type="button">{t('runtime.retry')}</button>
        </div>
      ) : null}

      {environment ? (
        <>
          <div className="runtime-platform-summary">
            <div><span>{t('runtime.platform')}</span><strong>{environment.platform}</strong></div>
            <div><span>{t('runtime.architecture')}</span><strong>{environment.architecture}</strong></div>
            <div><span>{t('runtime.checkedAt')}</span><strong>{new Date(environment.capturedAt).toLocaleTimeString()}</strong></div>
            <button onClick={() => void detect()} type="button">{t('runtime.refresh')}</button>
          </div>
          <div className="runtime-tools">
            <ToolStatus tool={environment.node} />
            <ToolStatus tool={environment.git} />
            <ToolStatus tool={environment.dsh} />
          </div>
          <div className={`runtime-dsh-status runtime-dsh-status--${compatibility?.status.toLowerCase()}`}>
            <div>
              <span>{t('runtime.dshStatus')}</span>
              <strong>
                {compatibility?.status === 'COMPATIBLE'
                  ? t('runtime.dshCompatible')
                  : compatibility?.status === 'INCOMPATIBLE'
                    ? t('runtime.dshIncompatible')
                    : compatibility?.status === 'MISSING'
                      ? t('runtime.dshMissing')
                      : t('runtime.dshUnknown')}
              </strong>
            </div>
            <small>{t('runtime.supportedRange', { range: compatibility?.supportedRange ?? '' })}</small>
            {!plan ? <button onClick={preparePlan} type="button">{t('runtime.prepareSetup')}</button> : null}
          </div>
        </>
      ) : null}

      {plan ? (
        <>
          <RuntimeSetupPlanReview plan={plan} />
          {state !== 'confirmed' ? (
            <div className="runtime-plan-actions">
              <button className="installation-secondary-action" onClick={() => setPlan(null)} type="button">
                {t('runtime.cancel')}
              </button>
              <button className="installation-primary-action" onClick={confirmPlan} type="button">
                {t('runtime.confirmSimulation')}
              </button>
            </div>
          ) : (
            <div className="runtime-confirmed" role="status">
              <strong>{t('runtime.confirmedTitle')}</strong>
              <p>{t('runtime.confirmedBody')}</p>
            </div>
          )}
        </>
      ) : null}

      <div className="runtime-trust-boundary">
        <strong>{t('runtime.trustedBoundary')}</strong>
        <p>{t('runtime.trustedBoundaryBody')}</p>
        <small>
          {trustBoundary.eligibleForFutureControlledInstall && !trustBoundary.automaticInstallAllowed
            ? t('runtime.futureEligibleNoAuto')
            : t('runtime.futureBlocked')}
        </small>
      </div>
    </section>
  )
}
