CREATE TYPE "PluginRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

ALTER TABLE "candidate_plugins"
  ADD COLUMN "category" VARCHAR(40) NOT NULL DEFAULT 'Other',
  ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "risk_level" "PluginRiskLevel" NOT NULL DEFAULT 'HIGH',
  ADD COLUMN "risk_reasons" JSONB NOT NULL DEFAULT '["INCOMPLETE_INSTALL_EVIDENCE","AUTOMATED_ASSESSMENT"]',
  ADD COLUMN "risk_assessed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "risk_model_version" VARCHAR(40) NOT NULL DEFAULT 'hhrisk-1';

CREATE TABLE "candidate_plugin_snapshots" (
  "id" VARCHAR(40) NOT NULL,
  "candidate_plugin_id" VARCHAR(40) NOT NULL,
  "metadata_sha256" CHAR(64) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "risk_level" "PluginRiskLevel" NOT NULL,
  "risk_reasons" JSONB NOT NULL,
  "permissions" JSONB NOT NULL,
  "source_metadata" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "observed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_plugin_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candidate_plugin_snapshots_candidate_plugin_id_metadata_sha256_key"
  ON "candidate_plugin_snapshots"("candidate_plugin_id", "metadata_sha256");
CREATE INDEX "candidate_plugin_snapshots_candidate_plugin_id_observed_at_idx"
  ON "candidate_plugin_snapshots"("candidate_plugin_id", "observed_at" DESC);

ALTER TABLE "candidate_plugin_snapshots"
  ADD CONSTRAINT "candidate_plugin_snapshots_candidate_plugin_id_fkey"
  FOREIGN KEY ("candidate_plugin_id") REFERENCES "candidate_plugins"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
