import type { Plugin } from '@harnesshub/types'
import { useI18n } from '@harnesshub/i18n'

export interface PluginCardProps {
  plugin: Plugin
  href?: string
}

export function PluginCard({ plugin, href }: PluginCardProps) {
  const { t } = useI18n()
  const unavailableSources = plugin.source_status.filter((source) => source.status === 'UNAVAILABLE')
  const content = (
    <>
      <div className="hh-plugin-card__topline">
        <span className="hh-plugin-card__category">{plugin.category}</span>
        {plugin.is_mock ? <span className="hh-status-pill">{t('plugin.mockData')}</span> : null}
        {unavailableSources.length > 0 ? (
          <span className="hh-status-pill hh-status-pill--warning">{t('plugin.sourceUnavailable')}</span>
        ) : null}
      </div>
      <div className="hh-plugin-card__heading">
        <div className="hh-plugin-card__icon" aria-hidden="true">
          {plugin.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2>{plugin.name}</h2>
          <div className="hh-plugin-card__author">
            <span>{t('plugin.byAuthor', { name: plugin.author.name })}</span>
          </div>
        </div>
      </div>
      <p>{plugin.description}</p>
      <div className="hh-plugin-card__meta" aria-label={t('plugin.metadata')}>
        <span>v{plugin.version}</span>
        <span>{plugin.compatibility.dsh}</span>
        <span>{plugin.license.spdx}</span>
        {plugin.source_commit ? <span>{plugin.source_commit.slice(0, 8)}</span> : null}
      </div>
      {plugin.tags.length > 0 ? (
        <div className="hh-tag-list" aria-label={t('plugin.tags')}>
          {plugin.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
      {plugin.permissions.length > 0 ? (
        <div className="hh-permission-list" aria-label={t('plugin.declaredPermissions')}>
          {plugin.permissions.map((permission) => (
            <span className={`hh-permission hh-permission--${permission.risk}`} key={permission.id}>
              {permission.label}
            </span>
          ))}
        </div>
      ) : (
        <div className="hh-metadata-pending">{t('plugin.permissionsPending')}</div>
      )}
    </>
  )

  if (href) {
    return (
      <a className="hh-plugin-card hh-plugin-card--link" href={href}>
        {content}
      </a>
    )
  }

  return <article className="hh-plugin-card">{content}</article>
}
