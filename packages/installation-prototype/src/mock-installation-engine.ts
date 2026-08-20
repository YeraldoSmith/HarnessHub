import type { EnvironmentManager } from './environment-manager.js'
import type {
  InstallationActor,
  InstallationAuditEvent,
  InstallationAuditResult,
  InstallationStatus,
  InstallationStep,
  InstallationStepKind,
  InstallationTransaction,
  MockInstallationManifest,
  SimulationScenario,
} from './types.js'

export class InstallationAuthorizationError extends Error {}
export class InstallationStateError extends Error {}

interface EngineOptions {
  now?: () => Date
  id?: () => string
}

const stepOrder: readonly InstallationStepKind[] = [
  'MANIFEST_RESOLUTION',
  'ENVIRONMENT_CHECK',
  'PERMISSION_ANALYSIS',
  'USER_CONFIRMATION',
  'SIMULATED_APPLY',
  'SIMULATED_VERIFY',
  'SIMULATED_ROLLBACK',
]

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function snapshot<T>(value: T): Readonly<T> {
  return deepFreeze(structuredClone(value))
}

export class MockInstallationEngine {
  private readonly transactions = new Map<string, InstallationTransaction>()
  private readonly auditEvents = new Map<string, InstallationAuditEvent[]>()
  private readonly now: () => Date
  private readonly id: () => string

  constructor(
    readonly manifest: MockInstallationManifest,
    private readonly environmentManager: EnvironmentManager,
    options: EngineOptions = {},
  ) {
    if (!manifest.simulationOnly || manifest.executionPolicy !== 'SIMULATION_ONLY') {
      throw new Error('MockInstallationEngine accepts simulation-only manifests.')
    }
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
  }

  request(actor: InstallationActor | null): Readonly<InstallationTransaction> {
    const userId = this.requireActor(actor)
    const timestamp = this.now().toISOString()
    const transactionId = `installation-${this.id()}`
    const transaction: InstallationTransaction = {
      id: transactionId,
      actorUserId: userId,
      pluginId: this.manifest.pluginId,
      pluginVersionId: this.manifest.pluginVersionId,
      pluginVersion: this.manifest.version,
      manifestId: this.manifest.manifestId,
      status: 'REQUESTED',
      steps: stepOrder.map((kind) => ({
        id: `step-${this.id()}`,
        kind,
        status: 'PENDING',
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      environmentSnapshotId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.transactions.set(transactionId, transaction)
    this.auditEvents.set(transactionId, [])
    this.appendAudit(transaction, null, 'REQUESTED', 'installation.requested', 'INFO')
    return snapshot(transaction)
  }

  analyze(actor: InstallationActor | null, transactionId: string): Readonly<InstallationTransaction> {
    const transaction = this.authorizedTransaction(actor, transactionId)
    this.assertStatus(transaction, 'REQUESTED')
    this.transition(transaction, 'ANALYZING', 'installation.analysis_started', 'INFO')
    this.completeStep(transaction, 'MANIFEST_RESOLUTION')
    const environment = this.environmentManager.checkEnvironment()
    transaction.environmentSnapshotId = environment.id
    this.completeStep(transaction, 'ENVIRONMENT_CHECK')
    const analysis = this.environmentManager.analyzeCapability(this.manifest, environment)
    if (!analysis.simulationOnly || analysis.blockingReasons.length > 0) {
      throw new InstallationStateError('Prototype capability analysis must remain simulation-only and unblocked.')
    }
    this.completeStep(transaction, 'PERMISSION_ANALYSIS')
    this.transition(
      transaction,
      'WAITING_CONFIRMATION',
      'installation.permission_review_ready',
      'SUCCESS',
    )
    return snapshot(transaction)
  }

  cancel(actor: InstallationActor | null, transactionId: string): Readonly<InstallationTransaction> {
    const transaction = this.authorizedTransaction(actor, transactionId)
    this.assertStatus(transaction, 'WAITING_CONFIRMATION')
    this.markStep(transaction, 'USER_CONFIRMATION', 'SKIPPED')
    this.transition(transaction, 'CANCELLED', 'installation.cancelled', 'INFO')
    return snapshot(transaction)
  }

  run(
    actor: InstallationActor | null,
    transactionId: string,
    scenario: SimulationScenario,
  ): Readonly<InstallationTransaction> {
    const transaction = this.authorizedTransaction(actor, transactionId)
    this.assertStatus(transaction, 'WAITING_CONFIRMATION')
    this.completeStep(transaction, 'USER_CONFIRMATION')
    this.transition(
      transaction,
      'INSTALLING_SIMULATED',
      'installation.simulation_started',
      'INFO',
    )

    if (scenario === 'SUCCESS') {
      this.completeStep(transaction, 'SIMULATED_APPLY')
      this.transition(transaction, 'VERIFYING', 'installation.verification_started', 'INFO')
      this.completeStep(transaction, 'SIMULATED_VERIFY')
      this.markStep(transaction, 'SIMULATED_ROLLBACK', 'SKIPPED')
      this.transition(transaction, 'INSTALLED', 'installation.simulation_installed', 'SUCCESS')
      return snapshot(transaction)
    }

    this.markStep(transaction, 'SIMULATED_APPLY', 'FAILED')
    this.transition(transaction, 'FAILED', 'installation.simulated_failure', 'FAILURE')
    this.transition(transaction, 'ROLLING_BACK', 'installation.rollback_started', 'INFO')
    if (scenario === 'FAIL_ROLLBACK_SUCCESS') {
      this.completeStep(transaction, 'SIMULATED_ROLLBACK')
      this.transition(transaction, 'ROLLED_BACK', 'installation.rollback_completed', 'SUCCESS')
    } else {
      this.markStep(transaction, 'SIMULATED_ROLLBACK', 'FAILED')
      this.transition(
        transaction,
        'RECOVERY_REQUIRED',
        'installation.recovery_required',
        'FAILURE',
      )
    }
    return snapshot(transaction)
  }

  getTransaction(
    actor: InstallationActor | null,
    transactionId: string,
  ): Readonly<InstallationTransaction> {
    return snapshot(this.authorizedTransaction(actor, transactionId))
  }

  getAudit(
    actor: InstallationActor | null,
    transactionId: string,
  ): readonly Readonly<InstallationAuditEvent>[] {
    this.authorizedTransaction(actor, transactionId)
    return snapshot(this.auditEvents.get(transactionId) ?? [])
  }

  private requireActor(actor: InstallationActor | null): string {
    const userId = actor?.userId.trim()
    if (!userId) throw new InstallationAuthorizationError('Authentication is required for installation simulation.')
    return userId
  }

  private authorizedTransaction(
    actor: InstallationActor | null,
    transactionId: string,
  ): InstallationTransaction {
    const userId = this.requireActor(actor)
    const transaction = this.transactions.get(transactionId)
    if (!transaction || transaction.actorUserId !== userId) {
      throw new InstallationAuthorizationError('Installation transaction is unavailable for this user.')
    }
    return transaction
  }

  private assertStatus(transaction: InstallationTransaction, status: InstallationStatus): void {
    if (transaction.status !== status) {
      throw new InstallationStateError(`Expected ${status}, received ${transaction.status}.`)
    }
  }

  private transition(
    transaction: InstallationTransaction,
    next: InstallationStatus,
    action: string,
    result: InstallationAuditResult,
  ): void {
    const previous = transaction.status
    transaction.status = next
    transaction.updatedAt = this.now().toISOString()
    this.appendAudit(transaction, previous, next, action, result)
  }

  private appendAudit(
    transaction: InstallationTransaction,
    previous: InstallationStatus | null,
    next: InstallationStatus,
    action: string,
    result: InstallationAuditResult,
  ): void {
    const event = deepFreeze<InstallationAuditEvent>({
      id: `audit-${this.id()}`,
      transactionId: transaction.id,
      actorUserId: transaction.actorUserId,
      action,
      fromStatus: previous,
      toStatus: next,
      timestamp: this.now().toISOString(),
      result,
    })
    this.auditEvents.get(transaction.id)?.push(event)
  }

  private completeStep(transaction: InstallationTransaction, kind: InstallationStepKind): void {
    this.markStep(transaction, kind, 'RUNNING')
    this.markStep(transaction, kind, 'SUCCEEDED')
  }

  private markStep(
    transaction: InstallationTransaction,
    kind: InstallationStepKind,
    status: InstallationStep['status'],
  ): void {
    const step = transaction.steps.find((candidate) => candidate.kind === kind)
    if (!step) throw new InstallationStateError(`Missing prototype step ${kind}.`)
    step.status = status
    step.updatedAt = this.now().toISOString()
    transaction.updatedAt = step.updatedAt
  }
}
