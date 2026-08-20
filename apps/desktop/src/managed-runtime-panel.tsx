import { useCallback, useEffect, useRef, useState } from 'react'

import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'

import {
  getManagedRuntimeStatus,
  nativeAvailable,
  openManagedRuntimeWorkspace,
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
    connection: runtime.prepared && nativeAvailable() ? 'CONNECTED' : 'DISCONNECTED',
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
  const sequence = useRef(0)
  const [events, setEvents] = useState<RuntimeEvent[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() => toSnapshot(runtime))

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

  return (
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
  )
}
