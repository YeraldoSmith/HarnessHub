import { useI18n, type TranslationKey } from '@harnesshub/i18n'
import type { RuntimeEvent, RuntimeSnapshot } from '@harnesshub/runtime-bridge'
import type { RuntimeEnvironmentSnapshot } from '@harnesshub/runtime-integration'
import type { Plugin } from '@harnesshub/types'

export type WorkspaceSection = 'home' | 'plugins' | 'runtime'
type WorkspaceIconName = 'home' | 'plugins' | 'agent' | 'runtime' | 'tasks' | 'account' | 'settings'

const runtimeStatusKeys: Record<RuntimeSnapshot['status'], TranslationKey> = {
  NOT_RUNNING: 'runtimeBridge.statusNotRunning',
  STARTING: 'runtimeBridge.statusStarting',
  RUNNING: 'runtimeBridge.statusRunning',
  BUSY: 'runtimeBridge.statusBusy',
  WAITING_INPUT: 'runtimeBridge.statusWaitingInput',
  ERROR: 'runtimeBridge.statusError',
}

const runtimeEventKeys: Record<RuntimeEvent['kind'], TranslationKey> = {
  RUNTIME_STARTED: 'runtimeBridge.eventRuntimeStarted',
  AGENT_READY: 'runtimeBridge.eventAgentReady',
  TASK_RUNNING: 'runtimeBridge.eventTaskRunning',
  INPUT_REQUIRED: 'runtimeBridge.eventInputRequired',
  RUNTIME_STOPPED: 'runtimeBridge.eventRuntimeStopped',
  RUNTIME_ERROR: 'runtimeBridge.eventRuntimeError',
}

function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  }
  const paths: Record<WorkspaceIconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    plugins: <><path d="M8 3v4M16 3v4M5 7h14v5a7 7 0 0 1-14 0Z" /><path d="M12 19v2" /></>,
    agent: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M9 12h.01M15 12h.01M9 16h6M12 7V3M10 3h4" /></>,
    runtime: <><path d="M8 4 3 9l5 5M16 4l5 5-5 5M14 2l-4 20" /></>,
    tasks: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 11 2 2 5-5M8 17h8" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.43 9 1.7 1.7 0 0 0 21 10h.08v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}>{paths[name]}</svg>
}

interface WorkspaceSidebarProps {
  active: WorkspaceSection
  runtimeConnected: boolean
  onNavigate(section: WorkspaceSection): void
}

export function WorkspaceSidebar({ active, runtimeConnected, onNavigate }: WorkspaceSidebarProps) {
  const { t } = useI18n()
  const primary: readonly { icon: WorkspaceIconName; label: TranslationKey; section?: WorkspaceSection }[] = [
    { icon: 'home', label: 'nav.home', section: 'home' },
    { icon: 'plugins', label: 'nav.plugins', section: 'plugins' },
    { icon: 'agent', label: 'nav.agent' },
    { icon: 'runtime', label: 'nav.runtime', section: 'runtime' },
    { icon: 'tasks', label: 'nav.tasks' },
  ]
  const secondary: readonly { icon: WorkspaceIconName; label: TranslationKey }[] = [
    { icon: 'account', label: 'nav.account' },
    { icon: 'settings', label: 'nav.settings' },
  ]

  const item = (entry: (typeof primary)[number]) => {
    const enabled = entry.section !== undefined
    return (
      <button
        aria-current={entry.section === active ? 'page' : undefined}
        className={entry.section === active ? 'active' : undefined}
        disabled={!enabled}
        key={entry.icon}
        onClick={() => entry.section && onNavigate(entry.section)}
        type="button"
      >
        <WorkspaceIcon name={entry.icon} />
        <span>{t(entry.label)}</span>
        {!enabled ? <small>{t('nav.soon')}</small> : null}
      </button>
    )
  }

  return (
    <aside className="desktop-sidebar">
      <div className="desktop-brand">
        <span aria-hidden="true">H</span>
        <div>
          <strong>HarnessHub</strong>
          <small>{t('desktop.workspace')}</small>
        </div>
      </div>

      <nav aria-label={t('desktop.navigation')}>
        <span className="desktop-nav-label">{t('nav.workspace')}</span>
        {primary.map(item)}
        <span className="desktop-nav-label desktop-nav-label--secondary">{t('nav.system')}</span>
        {secondary.map(item)}
      </nav>

      <div className="desktop-sidebar-status">
        <span className={runtimeConnected ? 'connected' : undefined} aria-hidden="true" />
        <div>
          <strong>{t('desktop.localRuntime')}</strong>
          <small>{runtimeConnected ? t('runtimeBridge.connected') : t('runtimeBridge.disconnected')}</small>
        </div>
        <em>Fixture</em>
      </div>
    </aside>
  )
}

interface WorkspaceDashboardProps {
  plugin: Plugin | null
  runtime: Readonly<RuntimeSnapshot> | null
  runtimeEvents: readonly Readonly<RuntimeEvent>[]
  environment: RuntimeEnvironmentSnapshot | null
  onNavigate(section: WorkspaceSection): void
}

export function WorkspaceDashboard({
  plugin,
  runtime,
  runtimeEvents,
  environment,
  onNavigate,
}: WorkspaceDashboardProps) {
  const { t } = useI18n()
  const runtimeConnected = runtime?.connection === 'CONNECTED'
  const dshStatus = environment?.dsh.status ?? 'MISSING'
  const dshLabel =
    dshStatus === 'AVAILABLE'
      ? t('runtime.statusAvailable')
      : dshStatus === 'ERROR'
        ? t('runtime.statusError')
        : t('runtime.statusMissing')

  return (
    <section className="workspace-dashboard workspace-section" id="home">
      <div className="dashboard-welcome">
        <div>
          <span>{t('dashboard.eyebrow')}</span>
          <h1>{t('dashboard.title')}</h1>
          <p>{t('dashboard.description')}</p>
        </div>
        <button onClick={() => onNavigate('runtime')} type="button">
          <WorkspaceIcon name="runtime" />
          {t('dashboard.openRuntime')}
        </button>
      </div>

      <div className="dashboard-status-grid">
        <article>
          <div className="dashboard-card-icon dashboard-card-icon--runtime"><WorkspaceIcon name="runtime" /></div>
          <div><span>{t('dashboard.runtimeStatus')}</span><strong>{runtime ? t(runtimeStatusKeys[runtime.status]) : t('dashboard.connecting')}</strong></div>
          <small className={runtimeConnected ? 'online' : undefined}>{runtimeConnected ? t('runtimeBridge.connected') : t('runtimeBridge.disconnected')}</small>
        </article>
        <article>
          <div className="dashboard-card-icon"><WorkspaceIcon name="agent" /></div>
          <div><span>{t('dashboard.dshStatus')}</span><strong>{dshLabel}</strong></div>
          <small>{environment?.dsh.version ?? t('runtime.versionUnknown')}</small>
        </article>
        <article>
          <div className="dashboard-card-icon"><WorkspaceIcon name="plugins" /></div>
          <div><span>{t('dashboard.pluginEntry')}</span><strong>{plugin?.name ?? t('dashboard.registryReady')}</strong></div>
          <button onClick={() => onNavigate('plugins')} type="button">{t('dashboard.viewPlugins')}</button>
        </article>
      </div>

      <div className="dashboard-lower-grid">
        <article className="dashboard-launch-card">
          <div>
            <span>{t('dashboard.workspaceLabel')}</span>
            <h2>{t('dashboard.workspaceTitle')}</h2>
            <p>{t('dashboard.workspaceBody')}</p>
          </div>
          <div className="dashboard-launch-visual" aria-hidden="true">
            <span>H</span><i /><span>DSH</span>
          </div>
        </article>

        <aside className="dashboard-activity">
          <div><h2>{t('dashboard.recentActivity')}</h2><small>{t('dashboard.localOnly')}</small></div>
          {runtimeEvents.length === 0 ? (
            <p>{t('dashboard.noActivity')}</p>
          ) : (
            <ol>
              {runtimeEvents.slice(-3).reverse().map((event) => (
                <li key={event.id}>
                  <span aria-hidden="true" />
                  <div><strong>{t(runtimeEventKeys[event.kind])}</strong><small>{new Date(event.timestamp).toLocaleTimeString()}</small></div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  )
}
