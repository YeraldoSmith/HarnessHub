import { useState } from 'react'

import { useI18n, type TranslationKey } from '@harnesshub/i18n'
import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'
import type { RuntimeEnvironmentSnapshot } from '@harnesshub/runtime-integration'

const runtimeStatusKeys: Record<RuntimeSnapshot['status'], TranslationKey> = {
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

interface AgentWorkspaceProps {
  runtime: Readonly<RuntimeSnapshot> | null
  events: readonly Readonly<RuntimeEvent>[]
  environment: RuntimeEnvironmentSnapshot | null
  showDevelopmentDetails?: boolean
}

export function AgentWorkspace({
  runtime,
  events,
  environment,
  showDevelopmentDetails = false,
}: AgentWorkspaceProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const connected = runtime?.connection === 'CONNECTED'
  const ready = connected && runtime.status !== 'ERROR' && runtime.status !== 'NOT_RUNNING'
  const runtimeVersion =
    runtime?.implementation === 'CONTRACT_FIXTURE' && !showDevelopmentDetails
      ? t('runtimeBridge.previewVersion')
      : runtime?.version ?? environment?.dsh.version ?? t('runtime.versionUnknown')

  return (
    <section className="agent-workspace workspace-section" id="agent-workspace">
      <header className="agent-workspace__header">
        <div>
          <span>{t('agent.eyebrow')}</span>
          <h1>{t('agent.title')}</h1>
          <p>{t('agent.description')}</p>
        </div>
        <div className={`agent-workspace__state ${ready ? 'ready' : ''}`}>
          <span aria-hidden="true" />
          <div>
            <small>{t('agent.agentStatus')}</small>
            <strong>
              {ready
                ? t(showDevelopmentDetails ? 'agent.readyDevelopment' : 'agent.ready')
                : t('agent.offline')}
            </strong>
          </div>
        </div>
      </header>

      <div className="agent-runtime-strip">
        <div><span>{t('agent.runtime')}</span><strong>{runtime?.runtimeName ?? 'DSH'}</strong></div>
        <div><span>{t('runtimeBridge.status')}</span><strong>{runtime ? t(runtimeStatusKeys[runtime.status]) : t('runtimeBridge.statusNotRunning')}</strong></div>
        <div><span>{t('agent.connection')}</span><strong>{connected ? t('runtimeBridge.connected') : t('runtimeBridge.disconnected')}</strong></div>
        <div><span>{t('agent.version')}</span><strong>{runtimeVersion}</strong></div>
      </div>

      <div className="agent-workspace__grid">
        <article className="agent-conversation">
          <div className="agent-panel-heading"><h2>{t('agent.conversation')}</h2><span>Preview</span></div>
          <div className="agent-conversation__empty">
            <span aria-hidden="true">✦</span>
            <p>{t('agent.conversationEmpty')}</p>
          </div>
          <label>
            <span>{t('agent.inputLabel')}</span>
            <textarea
              aria-describedby="agent-input-safety"
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('agent.inputPlaceholder')}
              value={draft}
            />
          </label>
          <div className="agent-composer-footer">
            <small id="agent-input-safety">{t('agent.sendUnavailable')}</small>
            <button disabled type="button">{t('agent.sendUnavailable')}</button>
          </div>
        </article>

        <aside className="agent-side-panels">
          <section>
            <div className="agent-panel-heading"><h2>{t('agent.taskStatus')}</h2><span>0</span></div>
            <strong>{t('agent.noTask')}</strong>
            <p>{t('agent.noTaskBody')}</p>
          </section>
          <section>
            <div className="agent-panel-heading"><h2>{t('agent.activity')}</h2><span>{events.length}</span></div>
            {events.length === 0 ? <p>{t('agent.noActivity')}</p> : (
              <ol>
                {events.slice(-5).reverse().map((event) => (
                  <li key={event.id}>
                    <span aria-hidden="true" />
                    <div><strong>{t(eventKeys[event.kind])}</strong><time>{new Date(event.timestamp).toLocaleTimeString()}</time></div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="agent-safety-note">
            <strong>{t('agent.safetyTitle')}</strong>
            <p>{t('agent.safetyBody')}</p>
          </section>
        </aside>
      </div>
    </section>
  )
}
