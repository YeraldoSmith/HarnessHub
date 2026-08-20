import type { Plugin } from '@harnesshub/types'
import { useI18n, type TranslationKey } from '@harnesshub/i18n'
import { isPluginSourceVerified, pluginRiskSummary, type PluginRiskSummary } from './plugin-trust.js'
import { PluginIcon } from './plugin-icon.js'

export interface PluginCardProps {
  plugin: Plugin
  href?: string
}

const riskKeys: Record<PluginRiskSummary, TranslationKey> = {
  pending: 'plugin.riskPending',
  low: 'plugin.riskLow',
  medium: 'plugin.riskMedium',
  high: 'plugin.riskHigh',
}

export function PluginCard({ plugin, href }: PluginCardProps) {
  const { t } = useI18n()
  const unavailableSources = plugin.source_status.filter((source) => source.status === 'UNAVAILABLE')
  const sourceVerified = isPluginSourceVerified(plugin)
  const risk = pluginRiskSummary(plugin)
  const content = (
    <>
      <div className="hh-plugin-card__topline">
        <span className="hh-plugin-card__category">{plugin.category}</span>
        <span className="hh-plugin-card__badges">
          {sourceVerified ? <span className="hh-status-pill hh-status-pill--verified">{t('plugin.sourceVerified')}</span> : null}
          {plugin.is_mock ? <span className="hh-status-pill">{t('plugin.mockData')}</span> : null}
          {unavailableSources.length > 0 ? (
            <span className="hh-status-pill hh-status-pill--warning">{t('plugin.sourceUnavailable')}</span>
          ) : null}
        </span>
      </div>
      <div className="hh-plugin-card__heading">
        <PluginIcon className="hh-plugin-card__icon" plugin={plugin} />
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
        <span>DSH {plugin.compatibility.dsh}</span>
        <span>{plugin.license.spdx}</span>
        <span>{t('plugin.downloadsReserved')}</span>
      </div>
      <div className={`hh-risk-summary hh-risk-summary--${risk}`}>{t(riskKeys[risk])}</div>
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
