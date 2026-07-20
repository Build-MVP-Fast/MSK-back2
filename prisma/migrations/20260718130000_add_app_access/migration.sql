-- App-dashboard access control, isolated from website RBAC and the mobile
-- app's grant system.
CREATE TABLE "AppRolePermission" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "AppRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppRolePermission_role_code_key" ON "AppRolePermission"("role", "code");
CREATE INDEX "AppRolePermission_role_idx" ON "AppRolePermission"("role");

CREATE TABLE "AppUserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,

    CONSTRAINT "AppUserPermissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUserPermissionOverride_userId_code_key" ON "AppUserPermissionOverride"("userId", "code");
CREATE INDEX "AppUserPermissionOverride_userId_idx" ON "AppUserPermissionOverride"("userId");
