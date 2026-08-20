export type FixtureRuntimeStatus =
  | 'NOT_RUNNING'
  | 'STARTING'
  | 'RUNNING'
  | 'BUSY'
  | 'WAITING_INPUT'
  | 'ERROR'

export type RuntimeConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'

export type RuntimeEventKind =
  | 'RUNTIME_STARTED'
  | 'AGENT_READY'
  | 'TASK_RUNNING'
  | 'INPUT_REQUIRED'
  | 'RUNTIME_STOPPED'
  | 'RUNTIME_ERROR'

export interface RuntimeEvent {
  readonly schemaVersion: 1
  readonly id: string
  readonly runtimeId: string
  readonly generation: number
  readonly sequence: number
  readonly kind: RuntimeEventKind
  readonly status: FixtureRuntimeStatus
  readonly timestamp: string
  readonly message: string
}

export interface RuntimeAuditEvent {
  readonly id: string
  readonly actor: 'LOCAL_DESKTOP_USER'
  readonly action: string
  readonly result: 'INFO' | 'SUCCESS' | 'FAILURE'
  readonly timestamp: string
  readonly runtimeId: string
}

export interface RuntimeSnapshot {
  readonly runtimeId: string
  readonly runtimeName: 'DSH'
  readonly implementation: 'CONTRACT_FIXTURE'
  readonly version: string
  readonly status: FixtureRuntimeStatus
  readonly connection: RuntimeConnectionStatus
  readonly generation: number
  readonly updatedAt: string
}

export interface RuntimeHealth {
  readonly healthy: boolean
  readonly status: FixtureRuntimeStatus
  readonly checkedAt: string
}

export interface RuntimeFixtureSession {
  readonly endpointOrigin: string
  readonly credential: string
  readonly expiresAt: string
}

export type RuntimeEventListener = (event: RuntimeEvent) => void
export type RuntimeConnectionListener = (connected: boolean) => void

export interface RuntimeFixtureTransport {
  createSession(): RuntimeFixtureSession
  connect(session: RuntimeFixtureSession): Promise<void>
  disconnect(session: RuntimeFixtureSession): Promise<void>
  start(session: RuntimeFixtureSession): Promise<RuntimeSnapshot>
  stop(session: RuntimeFixtureSession): Promise<RuntimeSnapshot>
  status(session: RuntimeFixtureSession): Promise<RuntimeSnapshot>
  healthCheck(session: RuntimeFixtureSession): Promise<RuntimeHealth>
  subscribeEvents(session: RuntimeFixtureSession, listener: RuntimeEventListener): () => void
  subscribeConnection(session: RuntimeFixtureSession, listener: RuntimeConnectionListener): () => void
}

export interface RuntimeBridge {
  connect(): Promise<RuntimeSnapshot>
  disconnect(): Promise<RuntimeSnapshot>
  reconnect(): Promise<RuntimeSnapshot>
  start(): Promise<RuntimeSnapshot>
  stop(): Promise<RuntimeSnapshot>
  status(): Promise<RuntimeSnapshot>
  healthCheck(): Promise<RuntimeHealth>
  snapshot(): Readonly<RuntimeSnapshot>
  events(): readonly Readonly<RuntimeEvent>[]
  auditEvents(): readonly Readonly<RuntimeAuditEvent>[]
  subscribe(listener: (snapshot: Readonly<RuntimeSnapshot>) => void): () => void
}

export interface ContractFixtureOptions {
  now?: () => Date
  id?: () => string
  port?: () => number
  wait?: (milliseconds: number) => Promise<void>
  credentialTtlMs?: number
}
