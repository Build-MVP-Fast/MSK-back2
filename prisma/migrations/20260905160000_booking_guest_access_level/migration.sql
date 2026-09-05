-- CreateEnum
CREATE TYPE "GuestAccessLevel" AS ENUM ('PROFILE_FULL', 'RESERVATION_PARTIAL', 'CHAT_ONLY');

-- AlterTable
ALTER TABLE "BookingGuest" ADD COLUMN "accessLevel" "GuestAccessLevel" NOT NULL DEFAULT 'PROFILE_FULL';
