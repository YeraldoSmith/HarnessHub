# Automated Plugin Discovery and Risk

HarnessHub treats discovery, trust, risk, and installability as separate facts.
`COLLECTED_UNVERIFIED` means that a public source was collected without human
review. It does not automatically allow or block installation.

## Collection and snapshots

The GitHub discovery adapter searches DSH topics and repository content, then
collects the repository owner, README excerpt, license, stars, update time,
default-branch commit, npm package metadata, fixed version, sha512 integrity,
and declared DSH compatibility. Each materially different observation creates
an immutable `CandidatePluginSnapshot`; repeat observations of the same hash do
not duplicate history.

Repository and package content is parsed as data. Discovery never executes a
package, lifecycle script, repository command, or user shell.

## Categories

The deterministic `hhrisk-1` model assigns one marketplace category:

- Coding
- Productivity
- Automation
- Data
- Research
- Other

## Risk levels

- `LOW`: complete fixed evidence and no detected high-risk capability.
- `MEDIUM`: runtime permissions such as network, file read, or telemetry need a
  visible permission review.
- `HIGH`: install scripts, subprocess access, credentials, file write, browser
  control, or incomplete install evidence require elevated caution.
- `CRITICAL`: explicit dangerous lifecycle-script patterns are blocked by
  default.

This automated assessment is not a safety certification. A later observation
can produce a new risk result without deleting the previous snapshot.

## Installation policy

- LOW requires one normal confirmation.
- MEDIUM shows detected permissions and requires confirmation.
- HIGH shows permissions and requires two separate confirmations.
- CRITICAL is blocked by default.

Every non-critical candidate must still have a fixed npm version, npm sha512
integrity, a fixed Git commit, an immutable discovery snapshot, and an HTTPS
GitHub repository URL. The native installer re-fetches npm integrity, disables
all package lifecycle scripts, writes only to the isolated DSH Profile, verifies
the resulting DSH configuration, records an append-only audit event, and rolls
back on failure.

Missing evidence blocks that artifact, even when its risk level is not
`CRITICAL`. This is an evidence failure, not a blanket unverified-plugin ban.
