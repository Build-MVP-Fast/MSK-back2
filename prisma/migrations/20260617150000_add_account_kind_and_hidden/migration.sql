-- New enum separating MSK's platform team (msk-admin) from app users.
CREATE TYPE "AccountKind" AS ENUM ('PLATFORM', 'APP');

-- Add the two columns to User. accountKind defaults to APP because most
-- existing rows are app users (guests + staff signups). Backfill below
-- promotes ADMIN/SUPER_USER rows back to PLATFORM so msk-admin keeps
-- working unchanged. isHidden defaults to false.
ALTER TABLE "User"
  ADD COLUMN "accountKind" "AccountKind" NOT NULL DEFAULT 'APP',
  ADD COLUMN "isHidden"    BOOLEAN       NOT NULL DEFAULT FALSE;

-- Backfill: any existing ADMIN or SUPER_USER is part of the MSK
-- platform team. Everything else stays on the APP lane.
UPDATE "User"
SET "accountKind" = 'PLATFORM'
WHERE "role" IN ('ADMIN', 'SUPER_USER');
