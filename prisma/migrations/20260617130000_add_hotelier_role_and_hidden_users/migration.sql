-- AlterEnum: distinguishes the customer who runs a property (HOTELIER)
-- from MSK's platform-side admin (ADMIN) so the app onboarding wizard
-- can create operator accounts without granting them access to the
-- internal msk-admin portal.
ALTER TYPE "UserRole" ADD VALUE 'HOTELIER';

-- AlterTable: support hidden test users that never appear in listing
-- endpoints even for SUPER_USER. Off by default — only deliberately
-- created hidden users flip this on.
ALTER TABLE "User" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "User_isHidden_idx" ON "User"("isHidden");
