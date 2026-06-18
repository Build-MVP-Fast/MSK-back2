-- Phase 0: attendance + leave-request tables for staff/receptionist/supervisor flows.
-- Idempotent so re-runs after a partial deploy don't blow up.

DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM ('CLOCKED_IN', 'CLOCKED_OUT', 'AUTO_CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM ('SICK', 'VACATION', 'PERSONAL', 'UNPAID', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AttendanceEntry" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "clockInAt"    TIMESTAMP(3) NOT NULL,
  "clockOutAt"   TIMESTAMP(3),
  "status"       "AttendanceStatus" NOT NULL DEFAULT 'CLOCKED_IN',
  "clockOutNote" TEXT,
  "clockInLat"   DOUBLE PRECISION,
  "clockInLng"   DOUBLE PRECISION,
  "clockOutLat"  DOUBLE PRECISION,
  "clockOutLng"  DOUBLE PRECISION,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AttendanceEntry_userId_clockInAt_idx"
  ON "AttendanceEntry"("userId", "clockInAt");
CREATE INDEX IF NOT EXISTS "AttendanceEntry_status_idx"
  ON "AttendanceEntry"("status");

DO $$ BEGIN
  ALTER TABLE "AttendanceEntry"
    ADD CONSTRAINT "AttendanceEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LeaveRequest" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "startDate"    TIMESTAMP(3) NOT NULL,
  "endDate"      TIMESTAMP(3) NOT NULL,
  "type"         "LeaveType"  NOT NULL DEFAULT 'PERSONAL',
  "reason"       TEXT,
  "status"       "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId"   TEXT,
  "reviewedAt"   TIMESTAMP(3),
  "reviewerNote" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeaveRequest_userId_startDate_idx"
  ON "LeaveRequest"("userId", "startDate");
CREATE INDEX IF NOT EXISTS "LeaveRequest_status_idx"
  ON "LeaveRequest"("status");

DO $$ BEGIN
  ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
