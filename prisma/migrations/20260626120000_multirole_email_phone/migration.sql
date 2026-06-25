-- Multi-role identity: drop the global UNIQUE on User.email and User.phone
-- and replace them with composite UNIQUE constraints scoped by role. This
-- lets one human register as Supplier, Property Operator, and Staff under
-- the same email — each role lives as its own row.
--
-- Postgres treats NULLs as distinct for UNIQUE indexes, so guest /
-- phone-only / pre-claim users with NULL email/phone aren't blocked.
--
-- Safe migration: no existing (email, role) pair can collide because the
-- old global UNIQUE on email already guaranteed at most one row per email.

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_phone_key";

DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_phone_key";

CREATE UNIQUE INDEX "User_email_role_key" ON "User"("email", "role");
CREATE UNIQUE INDEX "User_phone_role_key" ON "User"("phone", "role");
