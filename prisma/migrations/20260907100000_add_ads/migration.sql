CREATE TABLE "Ad" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "imageUrl"    TEXT NOT NULL,
    "linkUrl"     TEXT,
    "description" TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "order"       INTEGER NOT NULL DEFAULT 0,
    "startDate"   TIMESTAMP(3),
    "endDate"     TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Ad_isActive_order_idx" ON "Ad"("isActive", "order");
