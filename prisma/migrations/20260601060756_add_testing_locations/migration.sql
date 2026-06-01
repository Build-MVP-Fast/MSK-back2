-- CreateTable
CREATE TABLE "TestingLocation" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestingLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestingLocation_isPublished_idx" ON "TestingLocation"("isPublished");

-- CreateIndex
CREATE INDEX "TestingLocation_ordering_idx" ON "TestingLocation"("ordering");
