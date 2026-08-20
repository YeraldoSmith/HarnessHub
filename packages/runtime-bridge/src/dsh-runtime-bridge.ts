import { RuntimeAuthorizationError } from './contract-fixture.js'
import type {
  RuntimeAuditEvent,
  RuntimeBridge,
  RuntimeConnectionStatus,
  RuntimeEvent,
  RuntimeFixtureSession,
  RuntimeFixtureTransport,
  RuntimeHealth,
  RuntimeSnapshot,
} from './types.js'

export class RuntimeBridgeConnectionError extends Error {}
export class RuntimeEventValidationError extends Error {}

interface BridgeOptions {
  now?: () => Date
  id?: () => string
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function immutable<T>(value: T): Readonly<T> {
  return deepFreeze(structuredClone(value))
}

const validEventKinds = new Set([
  'RUNTIME_STARTED',
  'AGENT_READY',
  'TASK_RUNNING',
  'INPUT_REQUIRED',
  'RUNTIME_STOPPED',
  'RUNTIME_ERROR',
])

const validStatuses = new Set([
  'NOT_RUNNING',
  'STARTING',
  'RUNNING',
  'BUSY',
  'WAITING_INPUT',
  'ERROR',
])

export class DSHRuntimeBridge implements RuntimeBridge {
  private readonly now: () => Date
  private readonly id: () => string
  private readonly listeners = new Set<(snapshot: Readonly<RuntimeSnapshot>) => void>()
  private readonly runtimeEvents: RuntimeEvent[] = []
  private readonly audits: RuntimeAuditEvent[] = []
  private session: RuntimeFixtureSession | null = null
  private unsubscribeEvents: (() => void) | null = null
  private unsubscribeConnection: (() => void) | null = null
  private lastSequenceByGeneration = new Map<number, number>()
  private current: RuntimeSnapshot = {
    runtimeId: 'dsh-fixture-pending',
    runtimeName: 'DSH',
    implementation: 'CONTRACT_FIXTURE',
    version: '0.1.0-fixture.1',
    status: 'NOT_RUNNING',
    connection: 'DISCONNECTED',
    generation: 1,
    updatedAt: new Date(0).toISOString(),
  }

  constructor(
    private readonly transport: RuntimeFixtureTransport,
    options: BridgeOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
  }

  async connect(): Promise<RuntimeSnapshot> {
    if (this.current.connection === 'CONNECTED') return this.snapshot()
    this.setConnection('CONNECTING')
    this.session = this.transport.createSession()
    try {
      await this.transport.connect(this.session)
      this.attachSubscriptions(this.session)
      const next = await this.transport.status(this.session)
      this.update({ ...next, connection: 'CONNECTED' })
      this.audit('runtime.connection_established', 'SUCCESS')
      return this.snapshot()
    } catch (error) {
      this.setConnection('DISCONNECTED')
      this.audit('runtime.connection_failed', 'FAILURE')
      throw this.connectionError(error)
    }
  }

  async disconnect(): Promise<RuntimeSnapshot> {
    const session = this.requireSession()
    this.detachSubscriptions()
    try {
      await this.transport.disconnect(session)
    } finally {
      this.setConnection('DISCONNECTED')
      this.audit('runtime.connection_closed', 'INFO')
    }
    return this.snapshot()
  }

  async reconnect(): Promise<RuntimeSnapshot> {
    const session = this.requireSession()
    this.setConnection('RECONNECTING')
    this.detachSubscriptions()
    try {
      await this.transport.connect(session)
      this.attachSubscriptions(session)
      const next = await this.transport.status(session)
      this.update({ ...next, connection: 'CONNECTED' })
      this.audit('runtime.connection_restored', 'SUCCESS')
      return this.snapshot()
    } catch (error) {
      this.setConnection('DISCONNECTED')
      this.audit('runtime.reconnect_failed', 'FAILURE')
      throw this.connectionError(error)
    }
  }

  async start(): Promise<RuntimeSnapshot> {
    const session = this.requireConnectedSession()
    this.audit('runtime.start_requested', 'INFO')
    this.update({ ...this.current, status: 'STARTING', updatedAt: this.now().toISOString() })
    try {
      const next = await this.transport.start(session)
      this.update({ ...next, connection: 'CONNECTED' })
      this.audit('runtime.start_completed', 'SUCCESS')
      return this.snapshot()
    } catch (error) {
      this.update({ ...this.current, status: 'ERROR', updatedAt: this.now().toISOString() })
      this.audit('runtime.start_failed', 'FAILURE')
      throw error
    }
  }

  async stop(): Promise<RuntimeSnapshot> {
    const session = this.requireConnectedSession()
    this.audit('runtime.stop_requested', 'INFO')
    try {
      const next = await this.transport.stop(session)
      this.update({ ...next, connection: 'CONNECTED' })
      this.audit('runtime.stop_completed', 'SUCCESS')
      return this.snapshot()
    } catch (error) {
      this.audit('runtime.stop_failed', 'FAILURE')
      throw error
    }
  }

  async status(): Promise<RuntimeSnapshot> {
    const next = await this.transport.status(this.requireConnectedSession())
    this.update({ ...next, connection: 'CONNECTED' })
    return this.snapshot()
  }

  async healthCheck(): Promise<RuntimeHealth> {
    return this.transport.healthCheck(this.requireConnectedSession())
  }

  snapshot(): Readonly<RuntimeSnapshot> {
    return immutable(this.current)
  }

  events(): readonly Readonly<RuntimeEvent>[] {
    return immutable(this.runtimeEvents)
  }

  auditEvents(): readonly Readonly<RuntimeAuditEvent>[] {
    return immutable(this.audits)
  }

  subscribe(listener: (snapshot: Readonly<RuntimeSnapshot>) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  private attachSubscriptions(session: RuntimeFixtureSession): void {
    this.unsubscribeEvents = this.transport.subscribeEvents(session, (event) => this.receiveEvent(event))
    this.unsubscribeConnection = this.transport.subscribeConnection(session, (connected) => {
      if (!connected) {
        this.setConnection('DISCONNECTED')
        this.audit('runtime.connection_lost', 'FAILURE')
      }
    })
  }

  private detachSubscriptions(): void {
    this.unsubscribeEvents?.()
    this.unsubscribeConnection?.()
    this.unsubscribeEvents = null
    this.unsubscribeConnection = null
  }

  private receiveEvent(event: RuntimeEvent): void {
    try {
      this.validateEvent(event)
      this.runtimeEvents.push(immutable(event))
      this.lastSequenceByGeneration.set(event.generation, event.sequence)
      this.update({
        ...this.current,
        runtimeId: event.runtimeId,
        status: event.status,
        generation: event.generation,
        updatedAt: event.timestamp,
      })
      this.audit(`runtime.event.${event.kind.toLowerCase()}`, 'INFO')
    } catch (error) {
      this.update({ ...this.current, status: 'ERROR', updatedAt: this.now().toISOString() })
      this.audit('runtime.event_rejected', 'FAILURE')
      throw error
    }
  }

  private validateEvent(event: RuntimeEvent): void {
    const lastSequence = this.lastSequenceByGeneration.get(event.generation) ?? 0
    const valid =
      event.schemaVersion === 1 &&
      event.runtimeId === this.current.runtimeId &&
      validEventKinds.has(event.kind) &&
      validStatuses.has(event.status) &&
      event.generation >= this.current.generation &&
      event.sequence > lastSequence &&
      Number.isFinite(Date.parse(event.timestamp)) &&
      event.message.length <= 256
    if (!valid) throw new RuntimeEventValidationError('Runtime event failed schema or sequence validation.')
  }

  private requireSession(): RuntimeFixtureSession {
    if (!this.session) throw new RuntimeBridgeConnectionError('Runtime Bridge has no local session.')
    return this.session
  }

  private requireConnectedSession(): RuntimeFixtureSession {
    if (this.current.connection !== 'CONNECTED') {
      throw new RuntimeBridgeConnectionError('Runtime Bridge is not connected.')
    }
    return this.requireSession()
  }

  private setConnection(connection: RuntimeConnectionStatus): void {
    this.update({ ...this.current, connection, updatedAt: this.now().toISOString() })
  }

  private update(snapshot: RuntimeSnapshot): void {
    this.current = immutable(snapshot)
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.snapshot())
  }

  private audit(action: string, result: RuntimeAuditEvent['result']): void {
    this.audits.push(immutable({
      id: `runtime-audit-${this.id()}`,
      actor: 'LOCAL_DESKTOP_USER',
      action,
      result,
      timestamp: this.now().toISOString(),
      runtimeId: this.current.runtimeId,
    }))
    this.notify()
  }

  private connectionError(error: unknown): RuntimeBridgeConnectionError {
    const message = error instanceof RuntimeAuthorizationError ? 'Runtime authorization was rejected.' : 'Runtime connection failed.'
    return new RuntimeBridgeConnectionError(message)
  }
}
