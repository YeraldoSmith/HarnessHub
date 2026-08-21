import type {
  PluginCategory,
  PluginPermission,
  PluginPermissionId,
  PluginRiskLevel,
} from '@harnesshub/types'

export const CANDIDATE_RISK_MODEL_VERSION = 'hhrisk-1'

export interface CandidateRiskInput {
  name: string
  description: string
  readme: string | null
  topics?: string[]
  packageManifest?: Record<string, unknown>
  hasFixedVersion: boolean
  hasIntegrity: boolean
  hasCommit: boolean
  hasLicense: boolean
}

export interface CandidateRiskAssessment {
  category: PluginCategory
  permissions: PluginPermission[]
  riskLevel: PluginRiskLevel
  reasons: string[]
}

const permissionCopy: Record<PluginPermissionId, Omit<PluginPermission, 'id'>> = {
  'filesystem-read': { label: 'Read project files', description: 'May read files selected for the DSH workspace.', risk: 'medium' },
  'filesystem-write': { label: 'Modify project files', description: 'May create or modify files in the DSH workspace.', risk: 'high' },
  network: { label: 'Network access', description: 'May connect to external services while running.', risk: 'medium' },
  subprocess: { label: 'Run commands', description: 'May start local commands or subprocesses while running.', risk: 'high' },
  credentials: { label: 'Read environment and credentials', description: 'May request API keys, tokens, or environment configuration.', risk: 'high' },
  browser: { label: 'Control the browser', description: 'May automate browser actions and access page content.', risk: 'high' },
  'install-script': { label: 'Package lifecycle scripts', description: 'The package declares install-time scripts; HarnessHub keeps them disabled.', risk: 'high' },
  telemetry: { label: 'Telemetry', description: 'May send diagnostics or usage information to an external service.', risk: 'medium' },
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function manifestText(manifest: Record<string, unknown>): string {
  return JSON.stringify({
    scripts: record(manifest.scripts),
    dependencies: record(manifest.dependencies),
    optionalDependencies: record(manifest.optionalDependencies),
    peerDependencies: record(manifest.peerDependencies),
    keywords: manifest.keywords,
    bin: manifest.bin,
    dsh: manifest.dsh,
  }).toLowerCase()
}

function permission(id: PluginPermissionId): PluginPermission {
  return { id, ...permissionCopy[id] }
}

export function classifyCandidate(input: CandidateRiskInput): CandidateRiskAssessment {
  const manifest = input.packageManifest ?? {}
  const scripts = record(manifest.scripts)
  const lifecycleScripts = ['preinstall', 'install', 'postinstall', 'prepare']
    .flatMap((key) => typeof scripts[key] === 'string' ? [String(scripts[key])] : [])
  const text = [
    input.name,
    input.description,
    input.readme ?? '',
    ...(input.topics ?? []),
    manifestText(manifest),
  ].join(' ').toLowerCase()

  const category: PluginCategory =
    /\b(automation|workflow|scheduler|cron|pipeline|orchestrat)/.test(text) ? 'Automation'
      : /\b(database|sql|dataset|dataframe|csv|spreadsheet|analytics|postgres|mysql)/.test(text) ? 'Data'
        : /\b(research|paper|arxiv|citation|literature|knowledge|web search|search engine)/.test(text) ? 'Research'
          : /\b(code|coding|developer|typescript|javascript|python|git|repository|lint|debug|test)/.test(text) ? 'Coding'
            : /\b(productivity|calendar|todo|task|notes?|notion|email|office|slack)/.test(text) ? 'Productivity'
              : 'Other'

  const detected = new Set<PluginPermissionId>()
  if (/\b(fetch|axios|http|https|websocket|network|api endpoint|remote service)\b/.test(text)) detected.add('network')
  if (/\b(readfile|read file|filesystem read|project files?|workspace files?)\b/.test(text)) detected.add('filesystem-read')
  if (/\b(writefile|write file|modify files?|filesystem write|create files?)\b/.test(text)) detected.add('filesystem-write')
  if (/\b(child_process|spawn|execfile|shell command|subprocess|terminal command)\b/.test(text)) detected.add('subprocess')
  if (/\b(process\.env|api key|access token|secret|credential|environment variable)\b/.test(text)) detected.add('credentials')
  if (/\b(playwright|puppeteer|browser automation|browser control|selenium)\b/.test(text)) detected.add('browser')
  if (/\b(telemetry|analytics|sentry|diagnostics collection)\b/.test(text)) detected.add('telemetry')
  if (lifecycleScripts.length > 0) detected.add('install-script')

  const dangerousLifecycle = lifecycleScripts.some((script) =>
    /(curl|wget).{0,120}(\||&&).{0,40}(sh|bash|zsh)|\brm\s+-rf\b|\bsudo\b|invoke-webrequest|\beval\s*\(/i.test(script),
  )
  const incompleteEvidence = !input.hasFixedVersion || !input.hasIntegrity || !input.hasCommit
  const reasons: string[] = []
  let riskLevel: PluginRiskLevel

  if (dangerousLifecycle) {
    riskLevel = 'CRITICAL'
    reasons.push('DANGEROUS_LIFECYCLE_SCRIPT')
  } else if (
    detected.has('install-script') || detected.has('subprocess') || detected.has('credentials')
    || detected.has('filesystem-write') || detected.has('browser')
  ) {
    riskLevel = 'HIGH'
    reasons.push('HIGH_IMPACT_CAPABILITY')
  } else if (incompleteEvidence) {
    riskLevel = 'HIGH'
    reasons.push('INCOMPLETE_INSTALL_EVIDENCE')
  } else if (detected.size > 0) {
    riskLevel = 'MEDIUM'
    reasons.push('DECLARED_RUNTIME_PERMISSIONS')
  } else {
    riskLevel = 'LOW'
    reasons.push('NO_HIGH_RISK_SIGNAL_DETECTED')
  }
  if (!input.hasLicense) reasons.push('LICENSE_NOT_IDENTIFIED')
  if (lifecycleScripts.length > 0) reasons.push('INSTALL_SCRIPTS_DISABLED')
  reasons.push('AUTOMATED_ASSESSMENT')

  return {
    category,
    permissions: [...detected].map(permission),
    riskLevel,
    reasons: [...new Set(reasons)],
  }
}
