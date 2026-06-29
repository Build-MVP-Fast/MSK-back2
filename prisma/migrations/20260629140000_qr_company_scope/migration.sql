-- Add company scoping to QR codes so an operator only lists their own tenant's codes.
ALTER TABLE "QrCode" ADD COLUMN "companyId" TEXT;
CREATE INDEX "QrCode_companyId_idx" ON "QrCode"("companyId");
