-- Add enabledModules to OperatorSubscription
ALTER TABLE "OperatorSubscription" ADD COLUMN IF NOT EXISTS "enabledModules" TEXT[] NOT NULL DEFAULT '{}';

-- CreateTable: PlatformInvite
CREATE TABLE "PlatformInvite" (
    "id"          TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "role"        TEXT NOT NULL DEFAULT 'ADMIN',
    "accessPages" TEXT[] NOT NULL DEFAULT '{}',
    "token"       TEXT NOT NULL,
    "usedAt"      TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformInvite_token_key" ON "PlatformInvite"("token");
CREATE INDEX "PlatformInvite_email_idx" ON "PlatformInvite"("email");
CREATE INDEX "PlatformInvite_token_idx" ON "PlatformInvite"("token");
