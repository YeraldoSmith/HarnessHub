CREATE TYPE "CandidatePluginStatus" AS ENUM ('COLLECTED_UNVERIFIED');

CREATE TABLE "candidate_plugins" (
  "id" VARCHAR(40) NOT NULL,
  "provider" "SourceProvider" NOT NULL DEFAULT 'GITHUB',
  "external_id" VARCHAR(255) NOT NULL,
  "canonical_key" VARCHAR(255) NOT NULL,
  "repository" VARCHAR(255) NOT NULL,
  "repository_url" VARCHAR(500) NOT NULL,
  "owner" VARCHAR(120) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "default_branch" VARCHAR(255) NOT NULL,
  "readme_excerpt" TEXT,
  "license_spdx" VARCHAR(80),
  "stars" INTEGER NOT NULL DEFAULT 0,
  "upstream_updated_at" TIMESTAMPTZ(3) NOT NULL,
  "commit_sha" VARCHAR(40),
  "package_name" VARCHAR(214),
  "package_version" VARCHAR(80),
  "package_integrity" VARCHAR(300),
  "dsh_compatibility" VARCHAR(80),
  "metadata_sha256" CHAR(64) NOT NULL,
  "source_metadata" JSONB NOT NULL,
  "status" "CandidatePluginStatus" NOT NULL DEFAULT 'COLLECTED_UNVERIFIED',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(500),
  "discovered_at" TIMESTAMPTZ(3) NOT NULL,
  "last_observed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "candidate_plugins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candidate_plugins_canonical_key_key" ON "candidate_plugins"("canonical_key");
CREATE INDEX "candidate_plugins_status_upstream_updated_at_idx" ON "candidate_plugins"("status", "upstream_updated_at" DESC);
CREATE INDEX "candidate_plugins_owner_name_idx" ON "candidate_plugins"("owner", "name");
