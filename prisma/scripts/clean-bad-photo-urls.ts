/* eslint-disable no-console */
// One-off cleanup: deletes PropertyPhoto and RoomPhoto rows whose `url`
// starts with "http://localhost". These are the rows uploaded while
// S3_PUBLIC_URL on Render was wrong (it pointed at the S3 API endpoint
// instead of the R2 public domain), so the URLs baked into the DB are
// unreachable from anywhere except a developer's laptop.
//
// Run against any environment by setting DATABASE_URL appropriately:
//   DATABASE_URL="postgres://…neon.tech/…" npm run prisma:clean-photos
//
// Operates inside a single transaction so a partial failure rolls back.
// Prints the doomed IDs first so the operator can ⌃C if something looks
// off before the deletes commit.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BAD_PREFIX = 'http://localhost';

async function main() {
  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? '').host;
    } catch {
      return '<unknown>';
    }
  })();
  console.log(`Connected to DB host: ${dbHost}`);

  const propertyPhotos = await prisma.propertyPhoto.findMany({
    where: { url: { startsWith: BAD_PREFIX } },
    select: { id: true, propertyId: true, url: true },
  });
  const roomPhotos = await prisma.roomPhoto.findMany({
    where: { url: { startsWith: BAD_PREFIX } },
    select: { id: true, roomTypeId: true, roomId: true, url: true },
  });

  console.log(
    `Found ${propertyPhotos.length} PropertyPhoto and ${roomPhotos.length} RoomPhoto row(s) with localhost URLs.`,
  );

  if (propertyPhotos.length === 0 && roomPhotos.length === 0) {
    console.log('Nothing to delete. Exiting.');
    return;
  }

  for (const p of propertyPhotos) {
    console.log(`  PropertyPhoto ${p.id}  (property=${p.propertyId})  ${p.url}`);
  }
  for (const r of roomPhotos) {
    console.log(
      `  RoomPhoto     ${r.id}  (roomType=${r.roomTypeId ?? '-'} room=${r.roomId ?? '-'})  ${r.url}`,
    );
  }

  const [deletedPropertyPhotos, deletedRoomPhotos] = await prisma.$transaction([
    prisma.propertyPhoto.deleteMany({ where: { url: { startsWith: BAD_PREFIX } } }),
    prisma.roomPhoto.deleteMany({ where: { url: { startsWith: BAD_PREFIX } } }),
  ]);

  console.log(
    `Deleted: ${deletedPropertyPhotos.count} PropertyPhoto, ${deletedRoomPhotos.count} RoomPhoto.`,
  );
}

main()
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
