import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

import { useI18n } from '@harnesshub/i18n'

import { isHarnessHubDesktop } from './desktop-environment.js'
import {
  RuntimeEnvironmentManager,
  type NativeRuntimeEnvironmentSnapshot,
  type ReadonlyEnvironmentProbe,
  type RuntimeEnvironmentSnapshot,
} from '@harnesshub/runtime-integration'

import {
  prepareManagedRuntime,
  type ManagedRuntimeStatus,
} from './native-runtime.js'

class TauriEnvironmentProbe implements ReadonlyEnvironmentProbe {
  detect(): Promise<NativeRuntimeEnvironmentSnapshot> {
    return invoke<NativeRuntimeEnvironmentSnapshot>('detect_runtime_environment')
  }
}

export async function detectManagedRuntimeEnvironment(): Promise<RuntimeEnvironmentSnapshot | null> {
  if (!isHarnessHubDesktop()) return null
  return new RuntimeEnvironmentManager(new TauriEnvironmentProbe()).detect()
}

interface ManagedRuntimeSetupProps {
  runtime: ManagedRuntimeStatus
  onRuntimeChange(runtime: ManagedRuntimeStatus): void
  onEnvironment(environment: RuntimeEnvironmentSnapshot): void
  onAuditChange(): void
}

export function ManagedRuntimeSetup({
  runtime,
  onRuntimeChange,
  onEnvironment,
  onAuditChange,
}: ManagedRuntimeSetupProps) {
  const { t } = useI18n()
  const manager = useMemo(() => new RuntimeEnvironmentManager(new TauriEnvironmentProbe()), [])
  const [environment, setEnvironment] = useState<RuntimeEnvironmentSnapshot | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const detect = useCallback(async () => {
    if (!isHarnessHubDesktop()) return
    setError('')
    try {
      const snapshot = await manager.detect()
      setEnvironment(snapshot)
      onEnvironment(snapshot)
    } catch {
      setError(t('runtime.detectionFailed'))
    }
  }, [manager, onEnvironment, t])

  useEffect(() => { void detect() }, [detect])

  async function prepare(): Promise<void> {
    setPending(true)
    setError('')
    setMessage('')
    try {
      const result = await prepareManagedRuntime()
      onRuntimeChange(result.runtime)
      onAuditChange()
      setMessage(result.message)
      setConfirmed(false)
      await detect()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      onAuditChange()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="runtime-integration workspace-section" id="runtime-integration">
      <div className="runtime-heading">
        <div><span>{t('runtimeSetup.phase')}</span><h2>{t('runtime.title')}</h2></div>
        <p>{runtime.prepared
          ? t('runtimeSetup.readySummary', { version: runtime.dshVersion, profile: runtime.profile })
          : t('runtime.dshMissingHelp')}</p>
      </div>

      <div className={`runtime-dsh-status runtime-dsh-status--${runtime.prepared ? 'compatible' : 'missing'}`}>
        <div>
          <span>{t('runtime.dshStatus')}</span>
          <strong>{runtime.prepared ? t('runtime.dshCompatible') : t('runtime.dshMissing')}</strong>
          <p>{t(runtime.prepared ? 'runtimeSetup.isolatedBody' : 'runtimeSetup.prepareBody')}</p>
        </div>
        <small>@deepseek-ai/dsh@0.1.0-rc.8</small>
      </div>

      {!runtime.prepared ? (
        <div className="runtime-real-confirmation">
          <h3>{t('runtimeSetup.confirmTitle')}</h3>
          <ul>
            <li>{t('runtimeSetup.downloadStep')}</li>
            <li>{t('runtimeSetup.isolatedStep')}</li>
            <li>{t('runtimeSetup.safeStep')}</li>
          </ul>
          <label>
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>{t('runtimeSetup.confirmLabel')}</span>
          </label>
          <button disabled={!confirmed || pending || !isHarnessHubDesktop()} onClick={() => void prepare()} type="button">
            {pending ? t('runtimeSetup.preparing') : t('runtimeSetup.prepare')}
          </button>
          <p className="runtime-setup-hint">{t('runtimeSetup.timeHint')}</p>
        </div>
      ) : null}

      {environment ? (
        <details className="runtime-technical-details">
          <summary>{t('runtime.technicalDetails')}</summary>
          <div className="runtime-platform-summary">
            <div><span>{t('runtime.platform')}</span><strong>{environment.platform}</strong></div>
            <div><span>{t('runtime.architecture')}</span><strong>{environment.architecture}</strong></div>
            <div><span>{t('runtimeSetup.toolchain')}</span><strong>{environment.managedToolchainReady ? t('runtimeSetup.managedReady') : t('runtimeSetup.willPrepare')}</strong></div>
            <div><span>Node.js</span><strong>{environment.managedToolchainReady ? environment.node.version : '22.19.0'}</strong></div>
            <div><span>pnpm</span><strong>{environment.managedToolchainReady ? environment.pnpm.version : '11.19.0'}</strong></div>
            <button onClick={() => void detect()} type="button">{t('runtime.refresh')}</button>
          </div>
        </details>
      ) : null}

      {message ? <p className="runtime-message" role="status">{message}</p> : null}
      {error ? <p className="runtime-message runtime-message--error" role="alert">{error}</p> : null}
    </section>
  )
}
