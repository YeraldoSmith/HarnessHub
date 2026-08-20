CREATE TYPE "SourceType" AS ENUM ('GITHUB', 'NPM', 'GITHUB_NPM');
CREATE TYPE "SourceProvider" AS ENUM ('GITHUB', 'NPM');

CREATE TABLE "plugins" (
    "id" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "license" VARCHAR(80) NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plugin_sources" (
    "id" VARCHAR(40) NOT NULL,
    "plugin_id" VARCHAR(120) NOT NULL,
    "provider" "SourceProvider" NOT NULL,
    "repository_url" TEXT,
    "package_name" VARCHAR(214),
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "plugin_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plugin_versions" (
    "id" VARCHAR(40) NOT NULL,
    "plugin_id" VARCHAR(120) NOT NULL,
    "version" VARCHAR(80) NOT NULL,
    "source_commit" VARCHAR(40),
    "npm_version" VARCHAR(80),
    "compatibility" JSONB NOT NULL,
    "identity_key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plugin_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plugin_snapshots" (
    "id" VARCHAR(40) NOT NULL,
    "plugin_version_id" VARCHAR(40) NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "data" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plugin_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plugin_sources_plugin_id_provider_key" ON "plugin_sources"("plugin_id", "provider");
CREATE INDEX "plugin_sources_provider_idx" ON "plugin_sources"("provider");
CREATE UNIQUE INDEX "plugin_versions_identity_key_key" ON "plugin_versions"("identity_key");
CREATE INDEX "plugin_versions_plugin_id_created_at_idx" ON "plugin_versions"("plugin_id", "created_at" DESC);
CREATE INDEX "plugin_snapshots_plugin_version_id_checked_at_idx" ON "plugin_snapshots"("plugin_version_id", "checked_at" DESC);

ALTER TABLE "plugin_sources" ADD CONSTRAINT "plugin_sources_plugin_id_fkey"
  FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plugin_versions" ADD CONSTRAINT "plugin_versions_plugin_id_fkey"
  FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plugin_snapshots" ADD CONSTRAINT "plugin_snapshots_plugin_version_id_fkey"
  FOREIGN KEY ("plugin_version_id") REFERENCES "plugin_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_registry_immutable_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plugin_versions_immutable
  BEFORE UPDATE OR DELETE ON "plugin_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_registry_immutable_change();

CREATE TRIGGER plugin_snapshots_immutable
  BEFORE UPDATE OR DELETE ON "plugin_snapshots"
  FOR EACH ROW EXECUTE FUNCTION prevent_registry_immutable_change();
