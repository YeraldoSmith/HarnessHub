import type {
  ContractFixtureOptions,
  FixtureRuntimeStatus,
  RuntimeConnectionListener,
  RuntimeEvent,
  RuntimeEventKind,
  RuntimeEventListener,
  RuntimeFixtureSession,
  RuntimeFixtureTransport,
  RuntimeHealth,
  RuntimeSnapshot,
} from './types.js'

export class RuntimeAuthorizationError extends Error {}
export class RuntimeFixtureStateError extends Error {}

function secureRandomPort(): number {
  const value = new Uint16Array(1)
  globalThis.crypto.getRandomValues(value)
  return 49152 + ((value[0] ?? 0) % 16384)
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
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

export class ContractDshRuntimeFixture implements RuntimeFixtureTransport {
  private readonly now: () => Date
  private readonly id: () => string
  private readonly port: () => number
  private readonly wait: (milliseconds: number) => Promise<void>
  private readonly credentialTtlMs: number
  private readonly runtimeId: string
  private readonly eventListeners = new Set<RuntimeEventListener>()
  private readonly connectionListeners = new Set<RuntimeConnectionListener>()
  private session: RuntimeFixtureSession | null = null
  private connected = false
  private runtimeStatus: FixtureRuntimeStatus = 'NOT_RUNNING'
  private generation = 1
  private sequence = 0

  constructor(options: ContractFixtureOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.port = options.port ?? secureRandomPort
    this.wait = options.wait ?? defaultWait
    this.credentialTtlMs = options.credentialTtlMs ?? 15 * 60 * 1000
    this.runtimeId = `dsh-fixture-${this.id()}`
  }

  createSession(): RuntimeFixtureSession {
    const now = this.now()
    this.session = immutable({
      endpointOrigin: `http://127.0.0.1:${this.port()}`,
      credential: `fixture-${this.id()}-${this.id()}`,
      expiresAt: new Date(now.getTime() + this.credentialTtlMs).toISOString(),
    })
    this.connected = false
    return immutable(this.session)
  }

  async connect(session: RuntimeFixtureSession): Promise<void> {
    this.authorize(session, false)
    this.connected = true
    this.notifyConnection(true)
  }

  async disconnect(session: RuntimeFixtureSession): Promise<void> {
    this.authorize(session)
    this.connected = false
    this.notifyConnection(false)
  }

  async start(session: RuntimeFixtureSession): Promise<RuntimeSnapshot> {
    this.authorize(session)
    if (this.runtimeStatus !== 'NOT_RUNNING' && this.runtimeStatus !== 'ERROR') {
      throw new RuntimeFixtureStateError(`Cannot start fixture from ${this.runtimeStatus}.`)
    }
    this.runtimeStatus = 'STARTING'
    await this.wait(40)
    this.runtimeStatus = 'RUNNING'
    this.emit('RUNTIME_STARTED', 'Runtime Started')
    this.emit('AGENT_READY', 'Agent Ready')
    return this.buildSnapshot('CONNECTED')
  }

  async stop(session: RuntimeFixtureSession): Promise<RuntimeSnapshot> {
    this.authorize(session)
    if (this.runtimeStatus === 'NOT_RUNNING') return this.buildSnapshot('CONNECTED')
    if (this.runtimeStatus === 'STARTING') {
      throw new RuntimeFixtureStateError('Cannot stop fixture while it is starting.')
    }
    this.runtimeStatus = 'NOT_RUNNING'
    this.generation += 1
    this.sequence = 0
    this.emit('RUNTIME_STOPPED', 'Runtime Stopped')
    return this.buildSnapshot('CONNECTED')
  }

  async status(session: RuntimeFixtureSession): Promise<RuntimeSnapshot> {
    this.authorize(session)
    return this.buildSnapshot('CONNECTED')
  }

  async healthCheck(session: RuntimeFixtureSession): Promise<RuntimeHealth> {
    this.authorize(session)
    return immutable({
      healthy: this.runtimeStatus !== 'ERROR',
      status: this.runtimeStatus,
      checkedAt: this.now().toISOString(),
    })
  }

  subscribeEvents(session: RuntimeFixtureSession, listener: RuntimeEventListener): () => void {
    this.authorize(session)
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  subscribeConnection(
    session: RuntimeFixtureSession,
    listener: RuntimeConnectionListener,
  ): () => void {
    this.authorize(session)
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }

  simulateActivity(status: Extract<FixtureRuntimeStatus, 'BUSY' | 'WAITING_INPUT'>): void {
    if (!this.connected || this.runtimeStatus === 'NOT_RUNNING') {
      throw new RuntimeFixtureStateError('Fixture must be connected and running.')
    }
    this.runtimeStatus = status
    this.emit(status === 'BUSY' ? 'TASK_RUNNING' : 'INPUT_REQUIRED', status === 'BUSY' ? 'Task Running' : 'Waiting for Input')
  }

  simulateError(): void {
    if (!this.connected) throw new RuntimeFixtureStateError('Fixture must be connected.')
    this.runtimeStatus = 'ERROR'
    this.emit('RUNTIME_ERROR', 'Runtime Error')
  }

  simulateConnectionLoss(): void {
    if (!this.connected) return
    this.connected = false
    this.notifyConnection(false)
  }

  private authorize(session: RuntimeFixtureSession, requireConnected = true): void {
    const current = this.session
    const valid =
      current !== null &&
      session.endpointOrigin === current.endpointOrigin &&
      session.credential === current.credential &&
      session.expiresAt === current.expiresAt &&
      Date.parse(current.expiresAt) > this.now().getTime()
    if (!valid || (requireConnected && !this.connected)) {
      throw new RuntimeAuthorizationError('Runtime fixture connection is unauthorized.')
    }
  }

  private emit(kind: RuntimeEventKind, message: string): void {
    this.sequence += 1
    const event = immutable<RuntimeEvent>({
      schemaVersion: 1,
      id: `runtime-event-${this.id()}`,
      runtimeId: this.runtimeId,
      generation: this.generation,
      sequence: this.sequence,
      kind,
      status: this.runtimeStatus,
      timestamp: this.now().toISOString(),
      message,
    })
    for (const listener of this.eventListeners) listener(event)
  }

  private notifyConnection(connected: boolean): void {
    for (const listener of this.connectionListeners) listener(connected)
  }

  private buildSnapshot(connection: RuntimeSnapshot['connection']): RuntimeSnapshot {
    return immutable({
      runtimeId: this.runtimeId,
      runtimeName: 'DSH',
      implementation: 'CONTRACT_FIXTURE',
      version: '0.1.0-fixture.1',
      status: this.runtimeStatus,
      connection,
      generation: this.generation,
      updatedAt: this.now().toISOString(),
    })
  }
}
