-- AlterEnum: new OTP purpose for the checkout sign-in flow
ALTER TYPE "OtpPurpose" ADD VALUE 'CHECKOUT_SIGN_IN';

-- AlterTable: Booking gains mobile guest-wizard checkout fields
ALTER TABLE "Booking"
  ADD COLUMN "checkoutRoomPhotoUrls"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "checkoutBathroomPhotoUrls"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "checkoutKeyLocation"         TEXT,
  ADD COLUMN "checkoutKeyLocationPhotoUrl" TEXT,
  ADD COLUMN "checkoutStaffName"           TEXT,
  ADD COLUMN "checkoutFeedback"            TEXT,
  ADD COLUMN "checkoutConfirmedAt"         TIMESTAMP(3);
