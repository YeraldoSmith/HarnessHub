ALTER TYPE "IdentityBadge" ADD VALUE IF NOT EXISTS 'EARLY_USER';
ALTER TYPE "IdentityBadge" ADD VALUE IF NOT EXISTS 'BETA_TESTER';

CREATE SEQUENCE "harnesshub_public_user_id_seq" START WITH 2 INCREMENT BY 1 NO CYCLE;

ALTER TABLE "users" ADD COLUMN "public_id" BIGINT;
ALTER TABLE "users" ALTER COLUMN "public_id" SET DEFAULT nextval('"harnesshub_public_user_id_seq"');

UPDATE "users"
SET "public_id" = 1
WHERE "id" = 'a0fb0416-83b0-42a5-b368-00923c872b18';

WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") + 1 AS "assigned_id"
  FROM "users"
  WHERE "public_id" IS NULL
)
UPDATE "users" AS target
SET "public_id" = numbered."assigned_id"
FROM numbered
WHERE target."id" = numbered."id";

SELECT setval(
  '"harnesshub_public_user_id_seq"',
  GREATEST(1, (SELECT COALESCE(MAX("public_id"), 1) FROM "users")),
  true
);

ALTER TABLE "users" ALTER COLUMN "public_id" SET NOT NULL;
ALTER SEQUENCE "harnesshub_public_user_id_seq" OWNED BY "users"."public_id";
CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");

INSERT INTO "audit_events" (
  "id", "actor_user_id", "action", "target_type", "target_id", "metadata"
) VALUES (
  'a1bb7a26-f113-4aad-873f-7a33126df0ba',
  'a0fb0416-83b0-42a5-b368-00923c872b18',
  'identity.public_id_bootstrap',
  'User',
  'a0fb0416-83b0-42a5-b368-00923c872b18',
  '{"public_id":"HH-0000000001","migration":"20260820050000_beta_public_identity"}'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
