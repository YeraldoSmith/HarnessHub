import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '@harnesshub/i18n'
import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'

import {
  getManagedRuntimeStatus,
  nativeAvailable,
  openManagedRuntimeWorkspace,
  removeManagedPluginRecord,
  startManagedRuntime,
  stopManagedRuntime,
  type ManagedRuntimeStatus,
} from './native-runtime.js'
import { RuntimeBridgeView } from './runtime-bridge.js'

interface ManagedRuntimePanelProps {
  runtime: ManagedRuntimeStatus
  onRuntimeChange(runtime: ManagedRuntimeStatus): void
  onStateChange(snapshot: Readonly<RuntimeSnapshot>, events: readonly Readonly<RuntimeEvent>[]): void
  onAuditChange(): void
}

function createEvent(kind: RuntimeEvent['kind'], status: RuntimeEvent['status'], sequence: number): RuntimeEvent {
  return {
    schemaVersion: 1,
    id: `local-runtime-${Date.now()}-${sequence}`,
    runtimeId: 'harnesshub-local-dsh',
    generation: 1,
    sequence,
    kind,
    status,
    timestamp: new Date().toISOString(),
    message: kind,
  }
}

function toSnapshot(runtime: ManagedRuntimeStatus, pending = false): RuntimeSnapshot {
  return {
    runtimeId: 'harnesshub-local-dsh',
    runtimeName: 'DSH',
    implementation: 'LOCAL_DSH',
    version: runtime.dshVersion,
    status: pending ? 'STARTING' : runtime.running ? 'RUNNING' : 'NOT_RUNNING',
    connection: runtime.running && nativeAvailable() ? 'CONNECTED' : 'DISCONNECTED',
    generation: 1,
    updatedAt: new Date().toISOString(),
  }
}

export function ManagedRuntimePanel({
  runtime,
  onRuntimeChange,
  onStateChange,
  onAuditChange,
}: ManagedRuntimePanelProps) {
  const { t } = useI18n()
  const sequence = useRef(0)
  const [events, setEvents] = useState<RuntimeEvent[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() => toSnapshot(runtime))
  const [confirmedRemoval, setConfirmedRemoval] = useState<string[]>([])
  const [removingPackage, setRemovingPackage] = useState('')

  const publish = useCallback((nextRuntime: ManagedRuntimeStatus, nextEvents = events, starting = false) => {
    const nextSnapshot = toSnapshot(nextRuntime, starting)
    setSnapshot(nextSnapshot)
    onRuntimeChange(nextRuntime)
    onStateChange(nextSnapshot, nextEvents)
  }, [events, onRuntimeChange, onStateChange])

  useEffect(() => {
    publish(runtime)
  }, [publish, runtime])

  useEffect(() => {
    if (!nativeAvailable()) return
    const timer = window.setInterval(() => {
      void getManagedRuntimeStatus().then((next) => {
        if (next.running !== runtime.running || next.port !== runtime.port || next.plugins.length !== runtime.plugins.length) {
          publish(next)
        }
      }).catch(() => undefined)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [publish, runtime])

  function addEvent(kind: RuntimeEvent['kind'], status: RuntimeEvent['status']): RuntimeEvent[] {
    sequence.current += 1
    const next = [...events, createEvent(kind, status, sequence.current)]
    setEvents(next)
    return next
  }

  async function start(): Promise<void> {
    setPending(true)
    setError('')
    publish(runtime, events, true)
    try {
      const next = await startManagedRuntime()
      const nextEvents = addEvent('RUNTIME_STARTED', 'RUNNING')
      publish(next, nextEvents)
      onAuditChange()
    } catch (reason) {
      const nextEvents = addEvent('RUNTIME_ERROR', 'ERROR')
      const failed = { ...runtime, running: false, port: null, url: null, pid: null }
      const nextSnapshot = { ...toSnapshot(failed), status: 'ERROR' as const }
      setSnapshot(nextSnapshot)
      onStateChange(nextSnapshot, nextEvents)
      setError(reason instanceof Error ? reason.message : String(reason))
      onAuditChange()
    } finally {
      setPending(false)
    }
  }

  async function stop(): Promise<void> {
    setPending(true)
    setError('')
    try {
      const next = await stopManagedRuntime()
      const nextEvents = addEvent('RUNTIME_STOPPED', 'NOT_RUNNING')
      publish(next, nextEvents)
      onAuditChange()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setPending(false)
    }
  }

  async function removePlugin(packageName: string): Promise<void> {
    const record = runtime.plugins.find((plugin) => plugin.packageName === packageName)
    if (!record || !confirmedRemoval.includes(packageName)) return
    setRemovingPackage(packageName)
    setError('')
    try {
      const result = await removeManagedPluginRecord(record)
      publish(result.runtime)
      setConfirmedRemoval((current) => current.filter((value) => value !== packageName))
      onAuditChange()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      onAuditChange()
    } finally {
      setRemovingPackage('')
    }
  }

  return (
    <>
      <RuntimeBridgeView
        auditCount={events.length}
        error={error}
        events={events}
        onOpen={() => void openManagedRuntimeWorkspace().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))}
        onReconnect={() => void getManagedRuntimeStatus().then((next) => publish(next))}
        onStart={() => void start()}
        onStop={() => void stop()}
        pending={pending}
        runtimeReady={runtime.prepared}
        snapshot={snapshot}
      />
      <section className="managed-plugins workspace-section" aria-labelledby="managed-plugins-title">
        <header>
          <span>{t('managedPlugins.eyebrow')}</span>
          <h2 id="managed-plugins-title">{t('managedPlugins.title')}</h2>
          <p>{t('managedPlugins.body')}</p>
        </header>
        {runtime.plugins.length === 0 ? <p className="managed-plugins__empty">{t('managedPlugins.empty')}</p> : (
          <ul className="managed-plugins__list">
            {runtime.plugins.map((plugin) => (
              <li key={plugin.packageName}>
                <div>
                  <strong>{plugin.packageName}</strong>
                  <span>{plugin.version} · {plugin.enabled === false ? t('managedPlugins.disabled') : t('managedPlugins.active')}</span>
                  {plugin.issue ? <small>{plugin.issue}</small> : null}
                </div>
                <label>
                  <input
                    checked={confirmedRemoval.includes(plugin.packageName)}
                    onChange={(event) => setConfirmedRemoval((current) => event.target.checked
                      ? [...current, plugin.packageName]
                      : current.filter((value) => value !== plugin.packageName))}
                    type="checkbox"
                  />
                  <span>{t('managedPlugins.confirm')}</span>
                </label>
                <button
                  className="danger"
                  disabled={!confirmedRemoval.includes(plugin.packageName) || Boolean(removingPackage)}
                  onClick={() => void removePlugin(plugin.packageName)}
                  type="button"
                >
                  {removingPackage === plugin.packageName ? t('managedPlugins.removing') : t('managedPlugins.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
