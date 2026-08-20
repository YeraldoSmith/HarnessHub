export { GitHubSourceAdapter } from './github-adapter.js'
export { NpmSourceAdapter } from './npm-adapter.js'
export { GitHubDiscoveryAdapter, type GitHubDiscoveryOptions } from './github-discovery-adapter.js'
export { PluginSourceSync } from './plugin-source-sync.js'
export { SourceFetchError } from './http.js'
export {
  manualPluginSourceListSchema,
  manualPluginSourceSchema,
  type GitHubSourceResult,
  type ManualPluginSource,
  type NpmSourceResult,
  type SourceAdapterOptions,
  type PublicSourceCandidate,
  type PublicSourceCandidateStatus,
  type SourceAggregationAdapter,
} from './types.js'
