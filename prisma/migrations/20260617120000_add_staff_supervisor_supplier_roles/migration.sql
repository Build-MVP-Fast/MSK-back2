-- AlterEnum: backfill mobile-side roles so the staff onboarding wizard,
-- supplier portal, and shift-supervisor screens can actually persist a
-- user with their stated role instead of being coerced to ADMIN/RECEPTIONIST.
ALTER TYPE "UserRole" ADD VALUE 'STAFF';
ALTER TYPE "UserRole" ADD VALUE 'SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE 'SUPPLIER';
