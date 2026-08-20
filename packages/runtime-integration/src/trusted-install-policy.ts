import type { TrustedInstallCandidate, TrustedInstallDecision } from './types.js'

export function evaluateTrustedInstallBoundary(candidate: TrustedInstallCandidate): TrustedInstallDecision {
  const blockers: string[] = []
  if (!candidate.officialTestPlugin) blockers.push('OFFICIAL_TEST_PLUGIN_REQUIRED')
  if (candidate.riskLevel !== 'LOW') blockers.push('LOW_RISK_REQUIRED')
  if (!candidate.completeManifest) blockers.push('COMPLETE_MANIFEST_REQUIRED')
  if (!candidate.verifiedDeveloper) blockers.push('VERIFIED_DEVELOPER_REQUIRED')
  return Object.freeze({
    eligibleForFutureControlledInstall: blockers.length === 0,
    blockers: Object.freeze(blockers),
    automaticInstallAllowed: false as const,
  })
}
