-- AlterTable: Booking gets mobile guest-wizard check-in fields (all optional)
ALTER TABLE "Booking"
  ADD COLUMN "arrivalTime"          TEXT,
  ADD COLUMN "wantsRoomTypeChange"  BOOLEAN,
  ADD COLUMN "requestedRoomType"    TEXT,
  ADD COLUMN "physicalVerifyChoice" TEXT,
  ADD COLUMN "addressByCode"        BOOLEAN,
  ADD COLUMN "checkInCode"          TEXT,
  ADD COLUMN "signatureUrl"         TEXT,
  ADD COLUMN "additionalInfoText"   TEXT,
  ADD COLUMN "acceptedTermsAt"      TIMESTAMP(3);

CREATE UNIQUE INDEX "Booking_checkInCode_key" ON "Booking"("checkInCode");

-- AlterTable: BookingGuest gets the wizard's kids flag + count
ALTER TABLE "BookingGuest"
  ADD COLUMN "hasKids"   BOOLEAN,
  ADD COLUMN "kidsCount" INTEGER;
