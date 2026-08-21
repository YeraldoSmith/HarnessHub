import type { CandidatePlugin } from '@harnesshub/types'
import type { PublicSourceCandidate } from '@harnesshub/plugin-sources'

export const CANDIDATE_PLUGIN_REPOSITORY = Symbol('CANDIDATE_PLUGIN_REPOSITORY')

export interface CandidatePluginRepository {
  list(query?: string, limit?: number): Promise<{ items: CandidatePlugin[]; total: number }>
  upsertMany(candidates: PublicSourceCandidate[]): Promise<number>
  latestObservedAt(): Promise<Date | null>
}
