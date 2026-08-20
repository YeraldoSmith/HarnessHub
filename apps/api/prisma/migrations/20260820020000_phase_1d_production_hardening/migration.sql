CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TYPE "SourceAvailability" AS ENUM ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE');
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

ALTER TABLE "plugins"
  ADD COLUMN "author_name" VARCHAR(120),
  ADD COLUMN "author_handle" VARCHAR(120),
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "plugins" AS p
SET
  "author_name" = COALESCE((
    SELECT ps."data"->'author'->>'name'
    FROM "plugin_versions" pv
    JOIN "plugin_snapshots" ps ON ps."plugin_version_id" = pv."id"
    WHERE pv."plugin_id" = p."id"
    ORDER BY ps."checked_at" DESC, ps."created_at" DESC
    LIMIT 1
  ), 'unknown'),
  "author_handle" = COALESCE((
    SELECT ps."data"->'author'->>'handle'
    FROM "plugin_versions" pv
    JOIN "plugin_snapshots" ps ON ps."plugin_version_id" = pv."id"
    WHERE pv."plugin_id" = p."id"
    ORDER BY ps."checked_at" DESC, ps."created_at" DESC
    LIMIT 1
  ), 'unknown');

UPDATE "plugins"
SET "author_name" = COALESCE("author_name", 'unknown'),
    "author_handle" = COALESCE("author_handle", 'unknown');

ALTER TABLE "plugins"
  ALTER COLUMN "author_name" SET NOT NULL,
  ALTER COLUMN "author_handle" SET NOT NULL;

ALTER TABLE "plugin_sources"
  ADD COLUMN "status" "SourceAvailability" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "last_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "unavailable_since" TIMESTAMPTZ(3),
  ADD COLUMN "last_error" VARCHAR(500);

UPDATE "plugin_sources"
SET
  "status" = 'AVAILABLE',
  "last_verified_at" = NULLIF("evidence"->>'fetched_at', '')::TIMESTAMPTZ;

CREATE TABLE "sync_jobs" (
  "id" VARCHAR(40) NOT NULL,
  "plugin_id" VARCHAR(120) NOT NULL,
  "source" VARCHAR(40) NOT NULL,
  "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plugins_name_trgm_idx" ON "plugins" USING GIN ("name" public.gin_trgm_ops);
CREATE INDEX "plugins_description_trgm_idx" ON "plugins" USING GIN ("description" public.gin_trgm_ops);
CREATE INDEX "plugins_category_trgm_idx" ON "plugins" USING GIN ("category" public.gin_trgm_ops);
CREATE INDEX "plugins_author_name_trgm_idx" ON "plugins" USING GIN ("author_name" public.gin_trgm_ops);
CREATE INDEX "plugins_author_handle_trgm_idx" ON "plugins" USING GIN ("author_handle" public.gin_trgm_ops);
CREATE INDEX "plugins_tags_gin_idx" ON "plugins" USING GIN ("tags");
CREATE INDEX "plugin_sources_status_idx" ON "plugin_sources" ("status");
CREATE INDEX "sync_jobs_plugin_id_created_at_idx" ON "sync_jobs" ("plugin_id", "created_at" DESC);
CREATE INDEX "sync_jobs_status_created_at_idx" ON "sync_jobs" ("status", "created_at" DESC);
