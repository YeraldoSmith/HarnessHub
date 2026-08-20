import type { Plugin } from '@harnesshub/types'

import { IdentityBadge } from './identity-badge.js'

export interface PluginCardProps {
  plugin: Plugin
  href?: string
}

export function PluginCard({ plugin, href }: PluginCardProps) {
  const content = (
    <>
      <div className="hh-plugin-card__topline">
        <span className="hh-plugin-card__category">{plugin.category}</span>
        {plugin.is_mock ? <span className="hh-status-pill">Mock data</span> : null}
      </div>
      <div className="hh-plugin-card__heading">
        <div className="hh-plugin-card__icon" aria-hidden="true">
          {plugin.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2>{plugin.name}</h2>
          <div className="hh-plugin-card__author">
            <span>by {plugin.author.name}</span>
            {plugin.author.handle === 'YeraldoSmith' ? <IdentityBadge kind="founder" /> : null}
          </div>
        </div>
      </div>
      <p>{plugin.description}</p>
      <div className="hh-plugin-card__meta" aria-label="Plugin metadata">
        <span>v{plugin.version}</span>
        <span>{plugin.compatibility.dsh}</span>
        <span>{plugin.license.spdx}</span>
        {plugin.source_commit ? <span>{plugin.source_commit.slice(0, 8)}</span> : null}
      </div>
      {plugin.permissions.length > 0 ? (
        <div className="hh-permission-list" aria-label="Declared permissions">
          {plugin.permissions.map((permission) => (
            <span className={`hh-permission hh-permission--${permission.risk}`} key={permission.id}>
              {permission.label}
            </span>
          ))}
        </div>
      ) : (
        <div className="hh-metadata-pending">Permissions not assessed in Phase 1-B</div>
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
