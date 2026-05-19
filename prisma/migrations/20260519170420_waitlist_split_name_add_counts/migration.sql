-- New columns to capture the updated marketing waitlist form. Additive
-- only — `fullName` and `propertyName` stay so existing entries keep
-- their data and the admin view doesn't break.

ALTER TABLE "WaitlistEntry"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "propertyCount" INTEGER,
  ADD COLUMN "unitCount" INTEGER;
