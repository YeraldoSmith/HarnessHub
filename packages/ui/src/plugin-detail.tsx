import type { Plugin, PluginSnapshotRecord } from '@harnesshub/types'
import { useI18n, type TranslationKey } from '@harnesshub/i18n'

const statusKeys: Record<Plugin['source_status'][number]['status'], TranslationKey> = {
  AVAILABLE: 'plugin.available',
  UNAVAILABLE: 'plugin.unavailable',
  UNKNOWN: 'plugin.unknown',
}

export interface PluginDetailProps {
  plugin: Plugin
  snapshots?: PluginSnapshotRecord[]
}

export function PluginDetail({ plugin, snapshots }: PluginDetailProps) {
  const { t } = useI18n()
  return (
    <article className="hh-plugin-detail">
      <div className="hh-plugin-detail__eyebrow">
        <span>{plugin.category}</span>
        {plugin.is_mock ? <span className="hh-status-pill">{t('plugin.mockNotInstallable')}</span> : null}
      </div>

      <header className="hh-plugin-detail__header">
        <div className="hh-plugin-detail__icon" aria-hidden="true">
          {plugin.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1>{plugin.name}</h1>
          <div className="hh-plugin-card__author">
            <span>{t('plugin.byAuthor', { name: plugin.author.name })}</span>
          </div>
        </div>
      </header>

      <p className="hh-plugin-detail__description">{plugin.description}</p>

      {plugin.tags.length > 0 ? (
        <div className="hh-tag-list" aria-label={t('plugin.tags')}>
          {plugin.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}

      <dl className="hh-fact-grid">
        <div>
          <dt>{t('plugin.version')}</dt>
          <dd>{plugin.version}</dd>
        </div>
        <div>
          <dt>{t('plugin.source')}</dt>
          <dd>{plugin.source}</dd>
        </div>
        <div>
          <dt>{t('plugin.commitSha')}</dt>
          <dd title={plugin.source_commit ?? undefined}>
            {plugin.source_commit?.slice(0, 12) ?? t('plugin.notAvailable')}
          </dd>
        </div>
        <div>
          <dt>{t('plugin.npmVersion')}</dt>
          <dd>{plugin.npm_version ?? t('plugin.notAvailable')}</dd>
        </div>
        <div>
          <dt>{t('plugin.compatibility')}</dt>
          <dd>{plugin.compatibility.dsh}</dd>
        </div>
        <div>
          <dt>{t('plugin.license')}</dt>
          <dd>{plugin.license.name}</dd>
        </div>
      </dl>

      <section className="hh-plugin-detail__section hh-plugin-detail__availability">
        <div>
          <span className="hh-section-kicker">{t('plugin.currentUpstream')}</span>
          <h2>{t('plugin.sourceStatus')}</h2>
        </div>
        <div className="hh-source-status-list">
          {plugin.source_status.map((source) => (
            <div
              className={`hh-source-status hh-source-status--${source.status.toLowerCase()}`}
              key={source.provider}
            >
              <div>
                <strong>{source.provider}</strong>
                <span>{t(statusKeys[source.status])}</span>
              </div>
              <small>
                {t('plugin.lastVerified', {
                  time: source.last_verified_at
                    ? new Date(source.last_verified_at).toISOString()
                    : t('plugin.never'),
                })}
              </small>
              {source.status === 'UNAVAILABLE' ? (
                <p>{t('plugin.upstreamUnavailable')}</p>
              ) : null}
            </div>
          ))}
          {plugin.source_status.length === 0 ? (
            <div className="hh-empty-evidence">{t('plugin.noSourceStatus')}</div>
          ) : null}
        </div>
      </section>

      <section className="hh-plugin-detail__section">
        <div>
          <span className="hh-section-kicker">{t('plugin.declaredCapabilities')}</span>
          <h2>{t('plugin.permissions')}</h2>
        </div>
        <div className="hh-permission-details">
          {plugin.permissions.length > 0 ? (
            plugin.permissions.map((permission) => (
              <div className="hh-permission-detail" key={permission.id}>
                <span className={`hh-risk-dot hh-risk-dot--${permission.risk}`} aria-hidden="true" />
                <div>
                  <strong>{permission.label}</strong>
                  <p>{permission.description}</p>
                </div>
                <span className="hh-risk-label">{permission.risk}</span>
              </div>
            ))
          ) : (
            <div className="hh-empty-evidence">
              {t('plugin.permissionNotice')}
            </div>
          )}
        </div>
      </section>

      <section className="hh-plugin-detail__section hh-plugin-detail__sources">
        <div>
          <span className="hh-section-kicker">{t('plugin.immutableSnapshot')}</span>
          <h2>{t('plugin.sourceEvidence')}</h2>
        </div>
        <div className="hh-evidence-list">
          {plugin.source_evidence.map((evidence) => (
            <a href={evidence.url} key={`${evidence.provider}-${evidence.url}`} rel="noreferrer" target="_blank">
              <span>{evidence.provider}</span>
              <strong>
                {evidence.commit_sha?.slice(0, 12) ?? evidence.npm_version ?? t('plugin.sourceRecord')}
              </strong>
              <small>{t('plugin.fetched', { time: new Date(evidence.fetched_at).toISOString() })}</small>
            </a>
          ))}
        </div>
      </section>

      {snapshots ? (
        <section className="hh-plugin-detail__section hh-plugin-detail__history">
          <div>
            <span className="hh-section-kicker">{t('plugin.observations')}</span>
            <h2>{t('plugin.snapshotHistory')}</h2>
          </div>
          <ol className="hh-snapshot-list">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <div>
                  <strong>v{snapshot.plugin.version}</strong>
                  <span>{snapshot.plugin.source_commit?.slice(0, 12) ?? t('plugin.noCommit')}</span>
                </div>
                <time dateTime={snapshot.checked_at}>
                  {new Date(snapshot.checked_at).toISOString()}
                </time>
                <small>{t('plugin.evidenceCount', { count: snapshot.plugin.source_evidence.length })}</small>
              </li>
            ))}
            {snapshots.length === 0 ? (
              <li className="hh-snapshot-list__empty">{t('plugin.noSnapshots')}</li>
            ) : null}
          </ol>
        </section>
      ) : null}

      <aside className="hh-trust-note">
        <strong>{plugin.is_mock ? t('plugin.testFixture') : t('plugin.snapshotNotReview')}</strong>
        <p>
          {plugin.is_mock
            ? t('plugin.testFixtureNotice')
            : t('plugin.snapshotNotice')}
        </p>
      </aside>
    </article>
  )
}
