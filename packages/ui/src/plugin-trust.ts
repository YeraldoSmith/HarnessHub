import type { Plugin } from '@harnesshub/types'

export type PluginRiskSummary = 'pending' | 'low' | 'medium' | 'high' | 'critical'

export function pluginRiskSummary(plugin: Plugin): PluginRiskSummary {
  if (plugin.risk_level) return plugin.risk_level.toLowerCase() as Exclude<PluginRiskSummary, 'pending'>
  if (plugin.permissions.length === 0) return 'pending'
  if (plugin.permissions.some((permission) => permission.risk === 'high')) return 'high'
  if (plugin.permissions.some((permission) => permission.risk === 'medium')) return 'medium'
  return 'low'
}

export function isPluginSourceVerified(plugin: Plugin): boolean {
  if (plugin.registry_status === 'COLLECTED_UNVERIFIED') return false
  const providers = new Set(plugin.source_evidence.map((evidence) => evidence.provider))
  return (
    providers.has('github') &&
    providers.has('npm') &&
    plugin.source_status.length >= 2 &&
    plugin.source_status.every((source) => source.status === 'AVAILABLE')
  )
}
