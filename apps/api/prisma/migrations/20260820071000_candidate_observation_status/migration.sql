ALTER TABLE "candidate_plugins"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX "candidate_plugins_status_upstream_updated_at_idx";
CREATE INDEX "candidate_plugins_active_status_upstream_updated_at_idx"
  ON "candidate_plugins"("active", "status", "upstream_updated_at" DESC);
