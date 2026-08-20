CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'DELETED');
CREATE TYPE "IdentityProvider" AS ENUM ('GITHUB');
CREATE TYPE "PlatformRole" AS ENUM ('FOUNDER', 'ADMIN', 'MODERATOR', 'REVIEWER', 'DEVELOPER', 'USER');
CREATE TYPE "IdentityBadge" AS ENUM ('FOUNDER', 'OFFICIAL', 'VERIFIED_DEVELOPER', 'MODERATOR', 'REVIEWER');
CREATE TYPE "AssignmentScope" AS ENUM ('PLATFORM', 'PLUGIN');
CREATE TYPE "OAuthClient" AS ENUM ('WEB', 'DESKTOP');
CREATE TYPE "OAuthTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "security_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "suspended_at" TIMESTAMPTZ(3),
  "deactivated_at" TIMESTAMPTZ(3),
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauth_identities" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "IdentityProvider" NOT NULL,
  "issuer" VARCHAR(255) NOT NULL,
  "provider_user_id" VARCHAR(255) NOT NULL,
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_authenticated_at" TIMESTAMPTZ(3),
  "disabled_at" TIMESTAMPTZ(3),
  CONSTRAINT "oauth_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oauth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "role_assignments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "scope_type" "AssignmentScope" NOT NULL DEFAULT 'PLATFORM',
  "scope_id" VARCHAR(120),
  "granted_by_user_id" UUID,
  "reason" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_user_id" UUID,
  CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "role_assignments_scope_check" CHECK (
    ("scope_type" = 'PLATFORM' AND "scope_id" IS NULL) OR
    ("scope_type" = 'PLUGIN' AND "scope_id" IS NOT NULL)
  )
);

CREATE TABLE "user_badge_grants" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "badge" "IdentityBadge" NOT NULL,
  "granted_by_user_id" UUID,
  "evidence_type" VARCHAR(80) NOT NULL,
  "evidence_ref" VARCHAR(255),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "user_badge_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_badge_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "oauth_transactions" (
  "id" UUID NOT NULL,
  "state_hash" CHAR(64) NOT NULL,
  "code_verifier_ciphertext" TEXT,
  "client" "OAuthClient" NOT NULL,
  "status" "OAuthTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "desktop_poll_token_hash" CHAR(64),
  "desktop_session_ciphertext" TEXT,
  "error_code" VARCHAR(80),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "client" "OAuthClient" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "target_type" VARCHAR(80) NOT NULL,
  "target_id" VARCHAR(255),
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_identities_provider_issuer_provider_user_id_key"
  ON "oauth_identities"("provider", "issuer", "provider_user_id");
CREATE UNIQUE INDEX "oauth_identities_one_active_provider_per_user_idx"
  ON "oauth_identities"("user_id", "provider", "issuer") WHERE "disabled_at" IS NULL;
CREATE INDEX "oauth_identities_user_id_idx" ON "oauth_identities"("user_id");

CREATE UNIQUE INDEX "role_assignments_single_founder_idx"
  ON "role_assignments"("role") WHERE "role" = 'FOUNDER' AND "revoked_at" IS NULL;
CREATE UNIQUE INDEX "role_assignments_active_user_role_scope_idx"
  ON "role_assignments"("user_id", "role", "scope_type", COALESCE("scope_id", '')) WHERE "revoked_at" IS NULL;
CREATE INDEX "role_assignments_user_id_role_idx" ON "role_assignments"("user_id", "role");

CREATE UNIQUE INDEX "user_badge_grants_single_founder_idx"
  ON "user_badge_grants"("badge") WHERE "badge" = 'FOUNDER' AND "revoked_at" IS NULL;
CREATE UNIQUE INDEX "user_badge_grants_active_user_badge_idx"
  ON "user_badge_grants"("user_id", "badge") WHERE "revoked_at" IS NULL;
CREATE INDEX "user_badge_grants_user_id_badge_idx" ON "user_badge_grants"("user_id", "badge");

CREATE UNIQUE INDEX "oauth_transactions_state_hash_key" ON "oauth_transactions"("state_hash");
CREATE INDEX "oauth_transactions_status_expires_at_idx" ON "oauth_transactions"("status", "expires_at");
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at" DESC);
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at" DESC);

INSERT INTO "users" ("id", "status", "security_version")
VALUES ('a0fb0416-83b0-42a5-b368-00923c872b18', 'ACTIVE', 1);

INSERT INTO "oauth_identities" (
  "id", "user_id", "provider", "issuer", "provider_user_id", "metadata"
) VALUES (
  '92a4e49e-183e-4889-969d-dbb9cedc2ce7',
  'a0fb0416-83b0-42a5-b368-00923c872b18',
  'GITHUB',
  'https://github.com',
  '120692294',
  '{"login":"YeraldoSmith","bootstrap":true}'::jsonb
);

INSERT INTO "role_assignments" (
  "id", "user_id", "role", "scope_type", "reason"
) VALUES
  ('d0583c7c-1da8-43bc-afc1-10522007feef', 'a0fb0416-83b0-42a5-b368-00923c872b18', 'USER', 'PLATFORM', 'Founder bootstrap baseline'),
  ('fe783067-86c0-496b-a818-bc43dca101b3', 'a0fb0416-83b0-42a5-b368-00923c872b18', 'FOUNDER', 'PLATFORM', 'Founding identity GitHub user ID 120692294');

INSERT INTO "user_badge_grants" (
  "id", "user_id", "badge", "evidence_type", "evidence_ref"
) VALUES (
  '43bc75b0-8ff8-4a9c-a6f7-fc9bea608c48',
  'a0fb0416-83b0-42a5-b368-00923c872b18',
  'FOUNDER',
  'FOUNDING_IDENTITY',
  'github:120692294'
);

INSERT INTO "audit_events" (
  "id", "actor_user_id", "action", "target_type", "target_id", "metadata"
) VALUES (
  'c1a10bd9-7afd-4ad8-bc62-1f31ba39cba4',
  'a0fb0416-83b0-42a5-b368-00923c872b18',
  'identity.founder_bootstrap',
  'User',
  'a0fb0416-83b0-42a5-b368-00923c872b18',
  '{"provider":"GITHUB","provider_user_id":"120692294","migration":"20260820030000_phase_2b1_github_oauth"}'::jsonb
);
