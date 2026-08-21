# Guest-first and Public Plugin Discovery

## Guest-first boundary

HarnessHub Desktop treats authentication as an enhancement, not an execution prerequisite. A signed-out user may prepare the pinned DSH Runtime, start the local Runtime, and install or remove a published plugin with complete npm SHA-512 evidence or a fixed Git commit.

Guest operations remain local:

- the Runtime, Profile, plugin state, and append-only audit log stay in HarnessHub application data;
- the same explicit confirmation, pinned versions, sha256/sha512 verification, disabled lifecycle scripts, and isolated `DSH_HOME` apply;
- login adds cloud history, settings sync, multi-device features, public identity, and badges; it does not weaken or strengthen local installation policy.

Automatically discovered candidates are not automatically trusted. When their source
evidence is complete (fixed npm version and integrity, or canonical GitHub URL and
fixed commit), a user may install them after two explicit confirmations. The
`COLLECTED_UNVERIFIED` state remains visible throughout the flow and never becomes
a safety guarantee.

Only candidates with a reproducible DSH Bundle are shown in the public marketplace.
The preferred path has a fixed Git commit, a real `dsh.bundle.patch` at that commit,
an exact npm version, and npm SHA-512 integrity. The catalog path has a fixed Git
commit, package version, and safe Bundle patch path; it installs only from that
commit, with scripts disabled, then checks the installed Bundle again. Topic-only
repositories, examples, and source collections are not presented as installable plugins.

## Discovery pipeline

```text
GitHub `dsh-plugin` topic + source-verified community catalog
  -> GitHubDiscoveryAdapter
  -> CandidatePlugin (COLLECTED_UNVERIFIED)
  -> source checks / permission analysis / risk model
  -> Marketplace listing with visible evidence
  -> user confirmation (twice when unverified/high/critical)
  -> installation eligibility only when immutable source evidence is complete
```

The adapter collects repository identity, owner, description, README excerpt, license, stars, upstream update time, and a fixed default-branch commit. It then validates each root Bundle and every safe workspace path declared in `dsh.bundles`: the package must declare a safe relative `dsh.bundle.patch`, the referenced patch must exist at the fixed commit, and the exact package version must publish the same Bundle declaration plus a SHA-512 integrity value on npm. The bounded community catalog seed contributes only active, non-fork entries with a fixed Git commit, package version, and safe Bundle patch path. Those entries install from `git+https` at that exact commit, with scripts disabled, and their installed manifest is checked again before the Bundle is enabled. All catalog-sourced entries remain `COLLECTED_UNVERIFIED`.

Candidate records live in `candidate_plugins`, separate from immutable published Registry snapshots. `canonical_key = lower(owner/repo)#bundle-directory` provides case-insensitive deduplication while allowing one workspace to publish multiple installable Bundles. Sources already present in the published Registry are excluded.

## API

- `GET /discovery/candidates?q=&limit=1000` exposes unverified candidates for public browsing.
- `POST /discovery/refresh` starts a read-only refresh. It is globally rate-limited and uses a database-backed five-minute cooldown.
- `DISCOVERY_SYNC_INTERVAL_MINUTES=0` disables scheduled refresh. Setting a value of at least five minutes activates the reserved scheduler without changing the discovery implementation.

The refresh adapter retries transient upstream failures twice with bounded backoff. One refresh is shared in-process, so repeated callers do not fan out duplicate scans.

## GitHub and npm limits

`GITHUB_DISCOVERY_TOKEN` is server-only. When absent, the API may reuse the existing server-only `GITHUB_TOKEN`; without either token it inspects only a small, recent subset and must not replace a complete server snapshot. With a token, HarnessHub scans up to the GitHub Search window (1,000 topic results by default), pins each candidate to a commit, confirms a safe `dsh.bundle.patch` file exists at that commit, and verifies the same package version plus SHA-512 evidence on npm. Tokens must never be included in Desktop/Web variables or responses. GitHub detail calls use bounded concurrency to avoid burst traffic.

GitHub REST Search caps one query at 1,000 results. HarnessHub therefore treats the current token-backed scan as the complete Search window for each DSH topic, not as a mathematical claim that every matching repository on GitHub has been found. If a topic exceeds that cap, a future worker must partition GraphQL searches by time window before it may describe the catalog as complete.

The npm public registry is read only for package metadata. Package integrity is evidence for future verification, not automatic trust.
