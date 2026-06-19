-- Shift template table for the Property Operator's shifts tab.
-- Idempotent so a re-deploy on a partially-applied DB stays safe.

CREATE TABLE IF NOT EXISTS "Shift" (
    "id"         TEXT NOT NULL,
    "companyId"  TEXT,
    "title"      TEXT NOT NULL,
    "startTime"  TEXT NOT NULL,
    "endTime"    TEXT NOT NULL,
    "daysOfWeek" TEXT,
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Shift_companyId_idx" ON "Shift"("companyId");
