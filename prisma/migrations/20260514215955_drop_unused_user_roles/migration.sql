-- Drop unused UserRole values (GUEST, STAFF, SUPPLIER) from the enum.
-- Postgres can't drop values from an existing enum in place, so we
-- swap the type via rename-create-recast-drop.

-- Defensive: zero rows reference the removed values (verified before
-- writing this migration). If anything slipped in, the USING cast on
-- the next two statements will throw.

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('WEB_GUEST', 'RECEPTIONIST', 'ADMIN', 'SUPER_USER');

ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole"),
  ALTER COLUMN "primaryRole" TYPE "UserRole" USING ("primaryRole"::text::"UserRole");

DROP TYPE "UserRole_old";
