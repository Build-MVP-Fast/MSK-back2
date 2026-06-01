-- The previous schema sketched an unused RBAC scaffold with the names
-- Permission / RolePermission and a different shape (key+name +
-- role-by-id). Both tables are empty in every environment, so we drop
-- them outright and rebuild under the new shape (code-keyed +
-- enum-typed role) needed by the granular permissions matrix.

-- Drop conflicting old tables (verified empty across dev/staging/prod).
-- This also retires the legacy RBAC scaffold (RoleDefinition,
-- UserRoleAssignment) since the new permission system supersedes it.
-- Also drop UserPermissionOverride in case a partial first run left it,
-- so the rest of this migration always runs against a clean slate.
DROP TABLE IF EXISTS "UserPermissionOverride" CASCADE;
DROP TABLE IF EXISTS "UserRoleAssignment" CASCADE;
DROP TABLE IF EXISTS "RolePermission" CASCADE;
DROP TABLE IF EXISTS "Permission" CASCADE;
DROP TABLE IF EXISTS "RoleDefinition" CASCADE;

-- CreateTable Permission (new shape: code is the primary key + business key).
CREATE TABLE "Permission" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("code")
);

-- CreateTable RolePermission (new shape: role enum + permissionCode FK).
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserPermissionOverride.
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- Indexes.
CREATE INDEX "Permission_group_idx" ON "Permission"("group");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");
CREATE UNIQUE INDEX "RolePermission_role_permissionCode_key" ON "RolePermission"("role", "permissionCode");
CREATE INDEX "UserPermissionOverride_userId_idx" ON "UserPermissionOverride"("userId");
CREATE UNIQUE INDEX "UserPermissionOverride_userId_permissionCode_key" ON "UserPermissionOverride"("userId", "permissionCode");

-- Foreign keys.
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "Permission"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "Permission"("code") ON DELETE CASCADE ON UPDATE CASCADE;
