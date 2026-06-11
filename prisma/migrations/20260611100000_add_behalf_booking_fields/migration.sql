-- AlterTable: Booking gains booker contact fields so the mobile guest
-- wizard can distinguish "checking in on behalf" — where the operator
-- (booker) is a separate identity from the actual occupant (guest).
-- Existing rows are unaffected; all columns are nullable.
ALTER TABLE "Booking"
  ADD COLUMN "bookedByUserId"   TEXT,
  ADD COLUMN "bookerFirstName"  TEXT,
  ADD COLUMN "bookerLastName"   TEXT,
  ADD COLUMN "bookerEmail"      TEXT,
  ADD COLUMN "bookerPhone"      TEXT,
  ADD COLUMN "isBehalfBooking"  BOOLEAN NOT NULL DEFAULT FALSE;

-- FK so the booker's User row (if signed in at wizard time) can be
-- resolved in queries. ON DELETE SET NULL keeps the booking row alive
-- if the booker's account is later removed — the booker fields are
-- still useful as historical contact data.
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_bookedByUserId_fkey"
  FOREIGN KEY ("bookedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Booking_bookedByUserId_idx" ON "Booking"("bookedByUserId");
