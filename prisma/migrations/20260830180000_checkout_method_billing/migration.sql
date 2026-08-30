ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkoutMethod" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkoutPaymentMethod" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkoutStaffQrCode" TEXT;
