/**
 * One-time script to create a Super Admin account (SUPER_USER role)
 * with email + password login.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/create-super-admin.ts
 *
 * On Render Shell:
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register prisma/scripts/create-super-admin.ts
 */

import { PrismaClient, UserRole, AuthProvider, AccountKind } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

// ── Configure here ──────────────────────────────────────────────────────────
const SA_EMAIL = "admin@mskguestbook.com";
const SA_PASSWORD = "MSKAdmin2026!";
const SA_FIRST_NAME = "MSK";
const SA_LAST_NAME = "Admin";
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Creating Super Admin: ${SA_EMAIL}`);

  // Ensure the platform company exists
  const company = await prisma.company.upsert({
    where: { slug: "msk-platform" },
    update: {},
    create: { name: "MSK Guestbook Platform", slug: "msk-platform", country: "GB" },
  });

  const passwordHash = await argon2.hash(SA_PASSWORD);

  // Upsert the user
  const existing = await prisma.user.findFirst({
    where: { email: SA_EMAIL, role: UserRole.SUPER_USER },
  });

  if (existing) {
    // Update the password credential
    await prisma.userCredential.upsert({
      where: { userId_provider: { userId: existing.id, provider: AuthProvider.PASSWORD } },
      update: { secretHash: passwordHash },
      create: { userId: existing.id, provider: AuthProvider.PASSWORD, secretHash: passwordHash },
    });
    console.log(`✓ Updated password for existing Super Admin: ${SA_EMAIL}`);
  } else {
    await prisma.user.create({
      data: {
        email: SA_EMAIL,
        firstName: SA_FIRST_NAME,
        lastName: SA_LAST_NAME,
        fullName: `${SA_FIRST_NAME} ${SA_LAST_NAME}`,
        role: UserRole.SUPER_USER,
        primaryRole: UserRole.SUPER_USER,
        authProvider: AuthProvider.PASSWORD,
        accountKind: AccountKind.PLATFORM,
        emailVerified: true,
        companyId: company.id,
        credentials: {
          create: {
            provider: AuthProvider.PASSWORD,
            secretHash: passwordHash,
          },
        },
      },
    });
    console.log(`✓ Created Super Admin: ${SA_EMAIL}`);
  }

  console.log("");
  console.log("Login details:");
  console.log(`  URL:      https://msk-guest-web.vercel.app/super-admin/login`);
  console.log(`  Email:    ${SA_EMAIL}`);
  console.log(`  Password: ${SA_PASSWORD}`);
  console.log("");
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
