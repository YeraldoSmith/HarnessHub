import { useMemo, useState } from 'react'

import { useI18n } from '@harnesshub/i18n'
import type { AuthSessionResponse, Plugin } from '@harnesshub/types'
import { PluginDetail, PluginIcon, isPluginSourceVerified, pluginRiskSummary } from '@harnesshub/ui'

import { ManagedPluginInstall } from './managed-plugin-install.js'
import type { ManagedRuntimeStatus } from './native-runtime.js'

interface DesktopMarketplaceProps {
  plugins: Plugin[]
  loading: boolean
  error: string
  notice: string
  auth: AuthSessionResponse
  runtime: ManagedRuntimeStatus
  onRuntimeChange(runtime: ManagedRuntimeStatus): void
  onAuditChange(): void
}

export function DesktopMarketplace({
  plugins,
  loading,
  error,
  notice,
  auth,
  runtime,
  onRuntimeChange,
  onAuditChange,
}: DesktopMarketplaceProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<'name' | 'recent'>('name')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const categories = useMemo(
    () => [...new Set(plugins.map((plugin) => plugin.category))].sort((a, b) => a.localeCompare(b)),
    [plugins],
  )
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return plugins
      .filter((plugin) => !category || plugin.category === category)
      .filter((plugin) => !normalized || [
        plugin.name,
        plugin.description,
        plugin.author.name,
        plugin.author.handle,
        plugin.category,
        ...plugin.tags,
      ].some((value) => value.toLocaleLowerCase().includes(normalized)))
      .sort((a, b) => sort === 'recent'
        ? b.checked_at.localeCompare(a.checked_at) || a.id.localeCompare(b.id)
        : a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }, [category, plugins, query, sort])
  const selected = filtered.find((plugin) => plugin.id === selectedId) ?? filtered[0] ?? null

  return (
    <section className="workspace-plugin-section workspace-section" id="plugins">
      <div className="desktop-intro">
        <div><span>{t('desktop.validatedRecord')}</span><h1>{t('desktop.title')}</h1></div>
        <p>{t('desktop.description')}</p>
      </div>

      <div className="desktop-marketplace-controls">
        <input
          aria-label={t('web.searchLabel')}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('web.searchPlaceholder')}
          type="search"
          value={query}
        />
        <select aria-label={t('web.categoryLabel')} onChange={(event) => setCategory(event.target.value)} value={category}>
          <option value="">{t('web.allCategories')}</option>
          {categories.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={t('web.sortLabel')} onChange={(event) => setSort(event.target.value as 'name' | 'recent')} value={sort}>
          <option value="name">{t('web.sortName')}</option>
          <option value="recent">{t('web.sortRecent')}</option>
        </select>
        <strong>{t('desktop.marketplaceCount', { count: filtered.length })}</strong>
      </div>

      {loading ? <div className="desktop-message">{t('desktop.loading')}</div> : null}
      {!loading && !error && notice ? <div className="desktop-message desktop-message--notice">{notice}</div> : null}
      {error ? <div className="desktop-message desktop-message--error">{error}</div> : null}
      {!loading && !error && filtered.length === 0 ? <div className="desktop-message">{t('desktop.marketplaceEmpty')}</div> : null}
      {selected ? (
        <div className="desktop-marketplace-layout">
          <aside className="desktop-plugin-list" aria-label={t('desktop.selectPlugin')}>
            {filtered.map((plugin) => {
              const risk = pluginRiskSummary(plugin)
              return (
                <button
                  className={plugin.id === selected.id ? 'active' : undefined}
                  key={plugin.id}
                  onClick={() => setSelectedId(plugin.id)}
                  type="button"
                >
                  <PluginIcon className="desktop-plugin-icon" plugin={plugin} />
                  <span><strong>{plugin.name}</strong><small>{plugin.author.name} · v{plugin.version}</small></span>
                  <em className={`desktop-risk desktop-risk--${risk}`}>{risk === 'pending' ? t('plugin.riskPending') : risk.toUpperCase()}</em>
                  {isPluginSourceVerified(plugin) ? <i title={t('plugin.sourceVerified')}>✓</i> : null}
                </button>
              )
            })}
          </aside>
          <div className="desktop-plugin-detail">
            <PluginDetail plugin={selected} />
            <ManagedPluginInstall
              auth={auth}
              onAuditChange={onAuditChange}
              onRuntimeChange={onRuntimeChange}
              plugin={selected}
              runtime={runtime}
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}
