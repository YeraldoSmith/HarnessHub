CREATE TYPE "DeveloperVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'RESTRICTED');
CREATE TYPE "DeveloperClaimStatus" AS ENUM ('PENDING', 'VERIFYING', 'APPROVED', 'REJECTED', 'CONFLICT', 'EXPIRED', 'CANCELLED');
CREATE TYPE "OwnershipType" AS ENUM ('OWNER', 'MAINTAINER', 'TEAM_MEMBER', 'ORGANIZATION_DELEGATE');
CREATE TYPE "VerificationMethod" AS ENUM ('GITHUB_REPOSITORY_CHALLENGE');
CREATE TYPE "SourceOwnerType" AS ENUM ('USER', 'ORGANIZATION');

CREATE TABLE "developer_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "display_name" VARCHAR(80) NOT NULL,
  "bio" VARCHAR(500),
  "website" VARCHAR(500),
  "verification_status" "DeveloperVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "verified_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "developer_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "developer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "developer_claims" (
  "id" UUID NOT NULL,
  "plugin_id" VARCHAR(120) NOT NULL,
  "claimant_user_id" UUID NOT NULL,
  "oauth_identity_id" UUID NOT NULL,
  "provider" "IdentityProvider" NOT NULL DEFAULT 'GITHUB',
  "source_external_id" VARCHAR(255) NOT NULL,
  "source_owner_type" "SourceOwnerType" NOT NULL,
  "source_owner_external_id" VARCHAR(255) NOT NULL,
  "repository_url" VARCHAR(500) NOT NULL,
  "source_ref" VARCHAR(255) NOT NULL,
  "status" "DeveloperClaimStatus" NOT NULL DEFAULT 'PENDING',
  "proof_type" "VerificationMethod" NOT NULL,
  "challenge_hash" CHAR(64) NOT NULL,
  "challenge_path" VARCHAR(255) NOT NULL,
  "challenge_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "verified_at" TIMESTAMPTZ(3),
  "resolved_at" TIMESTAMPTZ(3),
  "error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "developer_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "developer_claims_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "developer_claims_claimant_user_id_fkey" FOREIGN KEY ("claimant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "developer_claims_oauth_identity_id_fkey" FOREIGN KEY ("oauth_identity_id") REFERENCES "oauth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "plugin_ownerships" (
  "id" UUID NOT NULL,
  "plugin_id" VARCHAR(120) NOT NULL,
  "user_id" UUID NOT NULL,
  "developer_claim_id" UUID NOT NULL,
  "ownership_type" "OwnershipType" NOT NULL DEFAULT 'OWNER',
  "verification_method" "VerificationMethod" NOT NULL,
  "source_external_id" VARCHAR(255) NOT NULL,
  "source_owner_type" "SourceOwnerType" NOT NULL,
  "source_owner_external_id" VARCHAR(255) NOT NULL,
  "verified_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "plugin_ownerships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plugin_ownerships_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plugin_ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plugin_ownerships_developer_claim_id_fkey" FOREIGN KEY ("developer_claim_id") REFERENCES "developer_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "verification_evidence" (
  "id" UUID NOT NULL,
  "developer_claim_id" UUID NOT NULL,
  "provider" "IdentityProvider" NOT NULL,
  "evidence_type" "VerificationMethod" NOT NULL,
  "source_external_id" VARCHAR(255) NOT NULL,
  "source_owner_type" "SourceOwnerType" NOT NULL,
  "source_owner_external_id" VARCHAR(255) NOT NULL,
  "repository_url" VARCHAR(500) NOT NULL,
  "commit_sha" VARCHAR(40) NOT NULL,
  "payload" JSONB NOT NULL,
  "observed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "verification_evidence_developer_claim_id_fkey" FOREIGN KEY ("developer_claim_id") REFERENCES "developer_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "developer_profiles_user_id_key" ON "developer_profiles"("user_id");
CREATE INDEX "developer_claims_plugin_id_status_idx" ON "developer_claims"("plugin_id", "status");
CREATE INDEX "developer_claims_claimant_user_id_created_at_idx" ON "developer_claims"("claimant_user_id", "created_at" DESC);
CREATE UNIQUE INDEX "developer_claims_active_user_plugin_idx"
  ON "developer_claims"("plugin_id", "claimant_user_id")
  WHERE "status" IN ('PENDING', 'VERIFYING');
CREATE UNIQUE INDEX "plugin_ownerships_developer_claim_id_key" ON "plugin_ownerships"("developer_claim_id");
CREATE INDEX "plugin_ownerships_user_id_verified_at_idx" ON "plugin_ownerships"("user_id", "verified_at" DESC);
CREATE INDEX "plugin_ownerships_plugin_id_ownership_type_idx" ON "plugin_ownerships"("plugin_id", "ownership_type");
CREATE UNIQUE INDEX "plugin_ownerships_one_active_owner_idx"
  ON "plugin_ownerships"("plugin_id")
  WHERE "ownership_type" = 'OWNER' AND "revoked_at" IS NULL;
CREATE UNIQUE INDEX "plugin_ownerships_active_user_plugin_idx"
  ON "plugin_ownerships"("plugin_id", "user_id")
  WHERE "revoked_at" IS NULL;
CREATE INDEX "verification_evidence_developer_claim_id_observed_at_idx"
  ON "verification_evidence"("developer_claim_id", "observed_at" DESC);
CREATE INDEX "verification_evidence_source_external_id_idx" ON "verification_evidence"("source_external_id");

CREATE OR REPLACE FUNCTION reject_verification_evidence_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verification_evidence rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_evidence_immutable_update
BEFORE UPDATE ON "verification_evidence"
FOR EACH ROW EXECUTE FUNCTION reject_verification_evidence_mutation();

CREATE TRIGGER verification_evidence_immutable_delete
BEFORE DELETE ON "verification_evidence"
FOR EACH ROW EXECUTE FUNCTION reject_verification_evidence_mutation();
