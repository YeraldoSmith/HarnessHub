# Guest-first and Public Plugin Discovery

## Guest-first boundary

HarnessHub Desktop treats authentication as an enhancement, not an execution prerequisite. A signed-out user may prepare the pinned DSH Runtime, start the local Runtime, and install or remove a published plugin with complete npm integrity evidence.

Guest operations remain local:

- the Runtime, Profile, plugin state, and append-only audit log stay in HarnessHub application data;
- the same explicit confirmation, pinned versions, sha256/sha512 verification, disabled lifecycle scripts, and isolated `DSH_HOME` apply;
- login adds cloud history, settings sync, multi-device features, public identity, and badges; it does not weaken or strengthen local installation policy.

Automatically discovered candidates are not automatically trusted. When their source
evidence is complete (fixed npm version and integrity, or canonical GitHub URL and
fixed commit), a user may install them after two explicit confirmations. The
`COLLECTED_UNVERIFIED` state remains visible throughout the flow and never becomes
a safety guarantee.

## Discovery pipeline

```text
GitHub topic/search + npm public metadata
  -> GitHubDiscoveryAdapter
  -> CandidatePlugin (COLLECTED_UNVERIFIED)
  -> source checks / permission analysis / risk model
  -> Marketplace listing with visible evidence
  -> user confirmation (twice when unverified/high/critical)
  -> installation eligibility only when immutable source evidence is complete
```

The adapter collects repository identity, owner, description, README excerpt, license, stars, upstream update time, default-branch commit, package metadata, integrity, and declared DSH compatibility when available. Repository contents are parsed as data and are never executed.

Candidate records live in `candidate_plugins`, separate from immutable published Registry snapshots. `canonical_key = lower(owner/repo)` provides case-insensitive deduplication. Sources already present in the published Registry are excluded.

## API

- `GET /discovery/candidates?q=&limit=100` exposes unverified candidates for public browsing.
- `POST /discovery/refresh` starts a read-only refresh. It is globally rate-limited and uses a database-backed five-minute cooldown.
- `DISCOVERY_SYNC_INTERVAL_MINUTES=0` disables scheduled refresh. Setting a value of at least five minutes activates the reserved scheduler without changing the discovery implementation.

The refresh adapter retries transient upstream failures twice with bounded backoff. One refresh is shared in-process, so repeated callers do not fan out duplicate scans.

## GitHub and npm limits

`GITHUB_DISCOVERY_TOKEN` is server-only. When absent, the API may reuse the existing server-only `GITHUB_TOKEN`; without either token it lowers the detail-enrichment budget. Tokens must never be included in Desktop/Web variables or responses. GitHub detail calls use bounded concurrency to avoid burst traffic.

The npm public registry is read only for package metadata. Package integrity is evidence for future verification, not automatic trust.
