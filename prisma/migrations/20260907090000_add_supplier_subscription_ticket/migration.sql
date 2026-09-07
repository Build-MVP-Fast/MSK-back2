-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable: OperatorSubscription
CREATE TABLE "OperatorSubscription" (
    "id"           TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "plan"         TEXT NOT NULL DEFAULT 'Basic',
    "status"       "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "amount"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "nextBilling"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SupportTicket
CREATE TABLE "SupportTicket" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT,
    "subject"   TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "status"    "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "reply"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Supplier
CREATE TABLE "Supplier" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "category"    TEXT,
    "contactName" TEXT,
    "email"       TEXT,
    "phone"       TEXT,
    "address"     TEXT,
    "notes"       TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex
CREATE UNIQUE INDEX "OperatorSubscription_companyId_key" ON "OperatorSubscription"("companyId");

-- Indexes
CREATE INDEX "SupportTicket_companyId_idx" ON "SupportTicket"("companyId");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

-- AddForeignKey
ALTER TABLE "OperatorSubscription" ADD CONSTRAINT "OperatorSubscription_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
