-- Marketing content for the website's Mews-backed properties (photos + text),
-- managed from the admin and keyed by the Mews property slug.
CREATE TABLE "PropertyContent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "heroImage" TEXT NOT NULL DEFAULT '',
    "images" JSONB,
    "rooms" JSONB,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PropertyContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyContent_slug_key" ON "PropertyContent"("slug");
CREATE INDEX "PropertyContent_ordering_idx" ON "PropertyContent"("ordering");
