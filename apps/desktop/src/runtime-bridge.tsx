import { useEffect, useMemo, useRef, useState } from 'react'

import { useI18n, type TranslationKey } from '@harnesshub/i18n'
import {
  ContractDshRuntimeFixture,
  DSHRuntimeBridge,
  type RuntimeBridge,
  type RuntimeEvent,
  type RuntimeSnapshot,
} from '@harnesshub/runtime-bridge'

const statusKeys: Record<RuntimeSnapshot['status'], TranslationKey> = {
  NOT_RUNNING: 'runtimeBridge.statusNotRunning',
  STARTING: 'runtimeBridge.statusStarting',
  RUNNING: 'runtimeBridge.statusRunning',
  BUSY: 'runtimeBridge.statusBusy',
  WAITING_INPUT: 'runtimeBridge.statusWaitingInput',
  ERROR: 'runtimeBridge.statusError',
}

const eventKeys: Record<RuntimeEvent['kind'], TranslationKey> = {
  RUNTIME_STARTED: 'runtimeBridge.eventRuntimeStarted',
  AGENT_READY: 'runtimeBridge.eventAgentReady',
  TASK_RUNNING: 'runtimeBridge.eventTaskRunning',
  INPUT_REQUIRED: 'runtimeBridge.eventInputRequired',
  RUNTIME_STOPPED: 'runtimeBridge.eventRuntimeStopped',
  RUNTIME_ERROR: 'runtimeBridge.eventRuntimeError',
}

export interface RuntimeBridgeViewProps {
  snapshot: Readonly<RuntimeSnapshot>
  events: readonly Readonly<RuntimeEvent>[]
  auditCount: number
  pending: boolean
  error: string
  onStart(): void
  onStop(): void
  onReconnect(): void
  onOpen?(): void
  showDevelopmentDetails?: boolean
  runtimeReady?: boolean
}

export function RuntimeBridgeView({
  snapshot,
  events,
  auditCount,
  pending,
  error,
  onStart,
  onStop,
  onReconnect,
  onOpen,
  showDevelopmentDetails = false,
  runtimeReady = true,
}: RuntimeBridgeViewProps) {
  const { t } = useI18n()
  const connected = snapshot.connection === 'CONNECTED'
  const realRuntime = snapshot.implementation === 'LOCAL_DSH'
  const canStart = runtimeReady && connected && (snapshot.status === 'NOT_RUNNING' || snapshot.status === 'ERROR')
  const canStop = connected && ['RUNNING', 'BUSY', 'WAITING_INPUT', 'ERROR'].includes(snapshot.status)

  return (
    <section className="runtime-bridge workspace-section" id="runtime-bridge">
      <div className="runtime-bridge-heading">
        <div>
          <span>{t('runtimeBridge.phase')}</span>
          <h2>{t('runtimeBridge.title')}</h2>
        </div>
        <p>
          {t(realRuntime ? 'runtimeBridge.realDescription' : showDevelopmentDetails ? 'runtimeBridge.description' : 'runtimeBridge.previewDescription')}
        </p>
      </div>

      <div className={realRuntime ? 'runtime-fixture-notice runtime-fixture-notice--real' : 'runtime-fixture-notice'} role="note">
        <span aria-hidden="true">◇</span>
        <div>
          <strong>
            {t(realRuntime ? 'runtimeBridge.realTitle' : showDevelopmentDetails ? 'runtimeBridge.fixtureTitle' : 'runtimeBridge.previewTitle')}
          </strong>
          <p>
            {t(realRuntime ? 'runtimeBridge.realBody' : showDevelopmentDetails ? 'runtimeBridge.fixtureBody' : 'runtimeBridge.previewBody')}
          </p>
        </div>
      </div>

      <div className="runtime-bridge-grid">
        <article className="runtime-console-card">
          <div className="runtime-console-card__title">
            <div className="runtime-avatar" aria-hidden="true">H</div>
            <div>
              <span>{t('runtimeBridge.agentRuntime')}</span>
              <h3>DSH</h3>
            </div>
            <small>
              {t(realRuntime ? 'runtimeBridge.realBadge' : showDevelopmentDetails ? 'runtimeBridge.fixtureBadge' : 'runtimeBridge.previewBadge')}
            </small>
          </div>

          <dl className="runtime-console-facts">
            <div>
              <dt>{t('runtimeBridge.status')}</dt>
              <dd className={`runtime-state runtime-state--${snapshot.status.toLowerCase()}`}>
                <span aria-hidden="true" />
                {t(statusKeys[snapshot.status])}
              </dd>
            </div>
            <div>
              <dt>{t('runtimeBridge.version')}</dt>
              <dd>
                {showDevelopmentDetails || snapshot.implementation !== 'CONTRACT_FIXTURE'
                  ? snapshot.version
                  : t('runtimeBridge.previewVersion')}
              </dd>
            </div>
            <div>
              <dt>{t('runtimeBridge.connection')}</dt>
              <dd>{connected ? t('runtimeBridge.connected') : t('runtimeBridge.disconnected')}</dd>
            </div>
          </dl>

          <div className="runtime-console-actions">
            <button disabled={!canStart || pending} onClick={onStart} type="button">
              {snapshot.status === 'STARTING' ? t('runtimeBridge.starting') : t('runtimeBridge.start')}
            </button>
            <button disabled={!canStop || pending} onClick={onStop} type="button">
              {t('runtimeBridge.stop')}
            </button>
            {realRuntime && snapshot.status === 'RUNNING' && onOpen ? (
              <button disabled={pending} onClick={onOpen} type="button">
                {t('runtimeBridge.openWorkspace')}
              </button>
            ) : null}
            {runtimeReady && !connected ? (
              <button disabled={pending} onClick={onReconnect} type="button">
                {t('runtimeBridge.reconnect')}
              </button>
            ) : null}
          </div>
          {error ? <p className="runtime-console-error" role="alert">{error}</p> : null}
        </article>

        <aside className="runtime-event-stream">
          <div>
            <span>{t('runtimeBridge.events')}</span>
            <small>{t('runtimeBridge.auditCount', { count: auditCount })}</small>
          </div>
          {events.length === 0 ? (
            <p>{t(realRuntime ? 'runtimeBridge.noRealEvents' : 'runtimeBridge.noEvents')}</p>
          ) : (
            <ol>
              {[...events.slice(-8)].reverse().map((event) => (
                <li key={event.id}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{t(eventKeys[event.kind])}</strong>
                    <small>{new Date(event.timestamp).toLocaleTimeString()}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  )
}

function createPrototypeBridge(): DSHRuntimeBridge {
  return new DSHRuntimeBridge(new ContractDshRuntimeFixture())
}

interface RuntimeBridgePanelProps {
  bridge?: RuntimeBridge
  onStateChange?(
    snapshot: Readonly<RuntimeSnapshot>,
    events: readonly Readonly<RuntimeEvent>[],
  ): void
  showDevelopmentDetails?: boolean
}

export function RuntimeBridgePanel({
  bridge: injectedBridge,
  onStateChange,
  showDevelopmentDetails = false,
}: RuntimeBridgePanelProps) {
  const { t } = useI18n()
  const translateRef = useRef(t)
  const disconnectTimerRef = useRef<number | null>(null)
  translateRef.current = t
  const bridge = useMemo(() => injectedBridge ?? createPrototypeBridge(), [injectedBridge])
  const [snapshot, setSnapshot] = useState(bridge.snapshot())
  const [events, setEvents] = useState(bridge.events())
  const [auditCount, setAuditCount] = useState(bridge.auditEvents().length)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (disconnectTimerRef.current !== null) {
      window.clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
    const unsubscribe = bridge.subscribe((next) => {
      if (!active) return
      setSnapshot(next)
      const nextEvents = bridge.events()
      setEvents(nextEvents)
      setAuditCount(bridge.auditEvents().length)
      onStateChange?.(next, nextEvents)
    })
    void bridge.connect()
      .catch(() => {
        if (active) setError(translateRef.current('runtimeBridge.connectionFailed'))
      })
      .finally(() => {
        if (active) setPending(false)
      })
    return () => {
      active = false
      unsubscribe()
      disconnectTimerRef.current = window.setTimeout(() => {
        disconnectTimerRef.current = null
        void bridge.disconnect().catch(() => undefined)
      }, 0)
    }
  }, [bridge, onStateChange])

  async function operate(operation: 'start' | 'stop' | 'reconnect'): Promise<void> {
    setPending(true)
    setError('')
    try {
      if (operation === 'start') await bridge.start()
      else if (operation === 'stop') await bridge.stop()
      else await bridge.reconnect()
    } catch {
      setError(t('runtimeBridge.operationFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <RuntimeBridgeView
      auditCount={auditCount}
      error={error}
      events={events}
      onReconnect={() => void operate('reconnect')}
      onStart={() => void operate('start')}
      onStop={() => void operate('stop')}
      pending={pending}
      snapshot={snapshot}
      showDevelopmentDetails={showDevelopmentDetails}
    />
  )
}
