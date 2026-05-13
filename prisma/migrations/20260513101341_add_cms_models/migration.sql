-- CreateEnum
CREATE TYPE "SiteContentType" AS ENUM ('PLAIN', 'RICH', 'MARKDOWN', 'IMAGE_URL', 'URL');

-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SiteContentType" NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseRule" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestRole" TEXT,
    "quote" TEXT NOT NULL,
    "photoUrl" TEXT,
    "rating" INTEGER,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpansionCity" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "expectedAt" TIMESTAMP(3),
    "description" TEXT,
    "imageUrl" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpansionCity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteContent_key_key" ON "SiteContent"("key");

-- CreateIndex
CREATE INDEX "SiteContent_group_idx" ON "SiteContent"("group");

-- CreateIndex
CREATE INDEX "Faq_category_ordering_idx" ON "Faq"("category", "ordering");

-- CreateIndex
CREATE INDEX "Faq_isPublished_idx" ON "Faq"("isPublished");

-- CreateIndex
CREATE INDEX "HouseRule_category_ordering_idx" ON "HouseRule"("category", "ordering");

-- CreateIndex
CREATE INDEX "HouseRule_isPublished_idx" ON "HouseRule"("isPublished");

-- CreateIndex
CREATE INDEX "Testimonial_ordering_idx" ON "Testimonial"("ordering");

-- CreateIndex
CREATE INDEX "Testimonial_isPublished_idx" ON "Testimonial"("isPublished");

-- CreateIndex
CREATE INDEX "ExpansionCity_ordering_idx" ON "ExpansionCity"("ordering");

-- CreateIndex
CREATE INDEX "ExpansionCity_isPublished_idx" ON "ExpansionCity"("isPublished");
