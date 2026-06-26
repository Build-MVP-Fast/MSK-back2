-- Unique username per role.
--
-- Username lives on User.metadata.username (a JSON field) — no real
-- column, so Prisma can't model a composite unique on it. We enforce
-- it directly in Postgres with a partial unique index on the
-- expression (metadata->>'username', role) where the value is set.
--
-- WHERE clause excludes rows that don't have a username so guest /
-- pre-claim accounts (no username at all) aren't blocked.
--
-- Defensive dedupe FIRST: an earlier attempt at this migration
-- failed against the live DB because pre-existing rows shared the
-- same (username, role) pair (legacy duplicates from broken wizard
-- runs before multi-role identity shipped). For each duplicate
-- group we keep the oldest row by createdAt and CLEAR
-- metadata.username on the newer ones — no rows are deleted, the
-- users remain valid, they just need to pick a username again next
-- time they edit their profile.

UPDATE "User"
SET "metadata" = "metadata" - 'username'
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY ("metadata"->>'username'), "role"
        ORDER BY "createdAt" ASC, id ASC
      ) AS rn
    FROM "User"
    WHERE "metadata" ? 'username'
      AND "metadata"->>'username' IS NOT NULL
      AND "metadata"->>'username' <> ''
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_role_key"
ON "User" (("metadata"->>'username'), "role")
WHERE "metadata"->>'username' IS NOT NULL;
