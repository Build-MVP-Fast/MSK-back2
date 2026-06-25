-- Unique username per role.
--
-- Username lives on User.metadata.username (a JSON field) — no real
-- column, so Prisma can't model a composite unique on it. We enforce
-- it directly in Postgres with a partial unique index on the
-- expression (metadata->>'username', role) where the value is set.
--
-- WHERE clause excludes rows that don't have a username so guest /
-- pre-claim accounts (no username at all) aren't blocked.

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_role_key"
ON "User" (("metadata"->>'username'), "role")
WHERE "metadata"->>'username' IS NOT NULL;
