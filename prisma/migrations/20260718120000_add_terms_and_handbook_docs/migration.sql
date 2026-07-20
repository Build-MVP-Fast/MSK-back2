-- Per-property Terms & Conditions documents (rich HTML, draft/published),
-- shown to guests during app check-in and managed from the app dashboard.
CREATE TABLE "PropertyTerms" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Terms & Conditions',
    "body" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PropertyTerms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyTerms_propertyId_ordering_idx" ON "PropertyTerms"("propertyId", "ordering");

ALTER TABLE "PropertyTerms"
    ADD CONSTRAINT "PropertyTerms_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-property handbook documents guests can view and download (PDF/DOC).
CREATE TABLE "HandbookDocument" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'PDF',
    "fileSize" INTEGER,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "HandbookDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HandbookDocument_propertyId_ordering_idx" ON "HandbookDocument"("propertyId", "ordering");

ALTER TABLE "HandbookDocument"
    ADD CONSTRAINT "HandbookDocument_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
