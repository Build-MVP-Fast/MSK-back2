-- Mark Mews-backed properties (the primary client) and hold optional
-- per-property Mews credentials for the reservation mirror.
ALTER TABLE "Property" ADD COLUMN "mewsEnterpriseId" TEXT;
ALTER TABLE "Property" ADD COLUMN "mewsAccessToken" TEXT;
