# Remote Control Plane Foundation

HarnessHub v0.7 introduces a replaceable, data-only control plane. It does not require a production domain and remains fully usable with bundled defaults.

## Bootstrap and fallback

Desktop always contains:

- `apps/desktop/src/default-config.json`;
- `apps/desktop/src/announcement.json`;
- a validated read-only Registry snapshot.

An optional build variable, `VITE_HARNESSHUB_REMOTE_CONFIG_URL`, may point to an HTTPS JSON document. Loopback HTTP is accepted only for local development. A validated remote response is cached; an invalid or unavailable response falls back to the last valid cache and then to the bundled default.

Public Beta builds may also provide `VITE_HARNESSHUB_API_URL` as a local build fallback. A valid remote `services.api_url` replaces that fallback without changing the application binary.

## Allowed configuration

Schema version 1 controls only:

- GitHub login visibility;
- announcement visibility;
- API and announcement JSON endpoints;
- a plain-text product notice.

The schema is strict. Unknown properties, invalid types, credentials in URLs, URL fragments, non-HTTPS remote services, HTML, scripts, commands, install policy, permission policy and plugin execution instructions are rejected or ignored by construction.

Remote data never changes the managed Runtime allowlist, integrity checks, user confirmation, disabled install scripts or DSH isolation.

## Announcements

Announcements are validated plain-text records with an ID, localized title/body, severity, publication time and optional expiry. Desktop displays a top banner and an expandable list. Read state and the last valid announcement payload are cached locally for offline use.

There is no reply, reaction, sharing, following or community feed.

## Guest boundary

The offline default disables GitHub login. Users can browse/search the Registry, inspect evidence, view and prepare Runtime, and enter the local workspace without an account. Login remains an optional identity feature that can be enabled only when an API service is ready.

Plugin execution safety remains independent of account state. Guest-first does not mean unknown code is allowed to run.

## Public identity

Authorization continues to use the internal UUID and stable OAuth provider user ID. `User.public_id` is a separate monotonic public identifier formatted as `HH-0000000001`; it is never used for authentication or permissions. The founder bootstrap is permanently assigned `HH-0000000001`.

The badge model now recognizes `EARLY_USER` and `BETA_TESTER`. Granting either badge requires an explicit, audited future policy; neither badge changes roles or plugin risk.

## Source aggregation

`GitHubDiscoveryAdapter` discovers public repository candidates using the GitHub repository search API. It deduplicates candidates, records a deterministic metadata hash, and always emits `COLLECTED_UNVERIFIED` with null commit/version/package-integrity fields until the existing metadata and evidence pipeline resolves them.

Discovery results are not written directly into the trusted Registry and are not installable. The next persistence step is a separate candidate queue with source verification, package identity matching, permission analysis and risk review.
