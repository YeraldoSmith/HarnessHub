import type { TranslationKey } from '@harnesshub/i18n'
import type { PluginPermissionId } from '@harnesshub/types'

export const permissionLabelKeys: Record<PluginPermissionId, TranslationKey> = {
  'filesystem-read': 'installation.permissionProjectFileRead',
  'filesystem-write': 'installation.permissionProjectFileWrite',
  network: 'installation.permissionNetworkAccess',
  subprocess: 'installation.permissionShellExecution',
  credentials: 'installation.permissionEnvironmentAccess',
  browser: 'installation.permissionBrowserControl',
  'install-script': 'installation.permissionInstallTimeCode',
  telemetry: 'installation.permissionTelemetry',
}

export const permissionReasonKeys: Record<PluginPermissionId, TranslationKey> = {
  'filesystem-read': 'installation.reasonProjectFileRead',
  'filesystem-write': 'installation.reasonProjectFileWrite',
  network: 'installation.reasonNetworkAccess',
  subprocess: 'installation.reasonShellExecution',
  credentials: 'installation.reasonEnvironmentAccess',
  browser: 'installation.reasonBrowserControl',
  'install-script': 'installation.reasonInstallTimeCode',
  telemetry: 'installation.reasonTelemetry',
}
