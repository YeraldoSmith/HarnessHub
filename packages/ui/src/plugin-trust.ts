import type { Plugin } from '@harnesshub/types'

export type PluginRiskSummary = 'pending' | 'low' | 'medium' | 'high'

export function pluginRiskSummary(plugin: Plugin): PluginRiskSummary {
  if (plugin.permissions.length === 0) return 'pending'
  if (plugin.permissions.some((permission) => permission.risk === 'high')) return 'high'
  if (plugin.permissions.some((permission) => permission.risk === 'medium')) return 'medium'
  return 'low'
}

export function isPluginSourceVerified(plugin: Plugin): boolean {
  const providers = new Set(plugin.source_evidence.map((evidence) => evidence.provider))
  return (
    providers.has('github') &&
    providers.has('npm') &&
    plugin.source_status.length >= 2 &&
    plugin.source_status.every((source) => source.status === 'AVAILABLE')
  )
}
