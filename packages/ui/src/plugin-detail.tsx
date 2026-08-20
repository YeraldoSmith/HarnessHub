import type { Plugin, PluginSnapshotRecord } from '@harnesshub/types'

import { IdentityBadge } from './identity-badge.js'

export interface PluginDetailProps {
  plugin: Plugin
  snapshots?: PluginSnapshotRecord[]
}

export function PluginDetail({ plugin, snapshots }: PluginDetailProps) {
  return (
    <article className="hh-plugin-detail">
      <div className="hh-plugin-detail__eyebrow">
        <span>{plugin.category}</span>
        {plugin.is_mock ? <span className="hh-status-pill">Mock Plugin · not installable</span> : null}
      </div>

      <header className="hh-plugin-detail__header">
        <div className="hh-plugin-detail__icon" aria-hidden="true">
          {plugin.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1>{plugin.name}</h1>
          <div className="hh-plugin-card__author">
            <span>by {plugin.author.name}</span>
            {plugin.author.handle === 'YeraldoSmith' ? <IdentityBadge kind="founder" /> : null}
          </div>
        </div>
      </header>

      <p className="hh-plugin-detail__description">{plugin.description}</p>

      <dl className="hh-fact-grid">
        <div>
          <dt>Version</dt>
          <dd>{plugin.version}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{plugin.source}</dd>
        </div>
        <div>
          <dt>Commit SHA</dt>
          <dd title={plugin.source_commit ?? undefined}>
            {plugin.source_commit?.slice(0, 12) ?? 'Not available'}
          </dd>
        </div>
        <div>
          <dt>npm version</dt>
          <dd>{plugin.npm_version ?? 'Not available'}</dd>
        </div>
        <div>
          <dt>DSH compatibility</dt>
          <dd>{plugin.compatibility.dsh}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>{plugin.license.name}</dd>
        </div>
      </dl>

      <section className="hh-plugin-detail__section">
        <div>
          <span className="hh-section-kicker">Declared capabilities</span>
          <h2>Permissions</h2>
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
              Permission analysis is intentionally outside the Registry phase. No safety conclusion is attached.
            </div>
          )}
        </div>
      </section>

      <section className="hh-plugin-detail__section hh-plugin-detail__sources">
        <div>
          <span className="hh-section-kicker">Immutable snapshot</span>
          <h2>Source evidence</h2>
        </div>
        <div className="hh-evidence-list">
          {plugin.source_evidence.map((evidence) => (
            <a href={evidence.url} key={`${evidence.provider}-${evidence.url}`} rel="noreferrer" target="_blank">
              <span>{evidence.provider}</span>
              <strong>
                {evidence.commit_sha?.slice(0, 12) ?? evidence.npm_version ?? 'source record'}
              </strong>
              <small>Fetched {new Date(evidence.fetched_at).toISOString()}</small>
            </a>
          ))}
        </div>
      </section>

      {snapshots ? (
        <section className="hh-plugin-detail__section hh-plugin-detail__history">
          <div>
            <span className="hh-section-kicker">Append-only observations</span>
            <h2>Snapshot history</h2>
          </div>
          <ol className="hh-snapshot-list">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <div>
                  <strong>v{snapshot.plugin.version}</strong>
                  <span>{snapshot.plugin.source_commit?.slice(0, 12) ?? 'No commit'}</span>
                </div>
                <time dateTime={snapshot.checked_at}>
                  {new Date(snapshot.checked_at).toISOString()}
                </time>
                <small>{snapshot.plugin.source_evidence.length} evidence records</small>
              </li>
            ))}
            {snapshots.length === 0 ? <li className="hh-snapshot-list__empty">No snapshots recorded.</li> : null}
          </ol>
        </section>
      ) : null}

      <aside className="hh-trust-note">
        <strong>{plugin.is_mock ? 'Test fixture' : 'Source snapshot, not a safety review'}</strong>
        <p>
          {plugin.is_mock
            ? 'This record is test-only and must not enter the production Registry.'
            : 'HarnessHub cross-checked the listed GitHub and npm identities at the recorded time. No install action, safety endorsement, or developer verification is attached.'}
        </p>
      </aside>
    </article>
  )
}
