/* eslint-disable no-console */
import { PrismaClient, UserRole, AuthProvider } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding…');

  // Core amenities
  const amenities = [
    { key: 'wifi', name: 'Wi-Fi', category: 'general' },
    { key: 'pool', name: 'Swimming pool', category: 'outdoor' },
    { key: 'parking', name: 'Free parking', category: 'general' },
    { key: 'breakfast', name: 'Breakfast', category: 'food' },
    { key: 'air_conditioning', name: 'Air conditioning', category: 'comfort' },
    { key: 'heating', name: 'Heating', category: 'comfort' },
    { key: 'gym', name: 'Gym', category: 'wellness' },
    { key: 'spa', name: 'Spa', category: 'wellness' },
    { key: 'pet_friendly', name: 'Pet friendly', category: 'general' },
    { key: 'kitchen', name: 'Kitchen', category: 'kitchen' },
    { key: 'tv', name: 'TV', category: 'entertainment' },
    { key: 'workspace', name: 'Workspace', category: 'business' },
  ];
  for (const a of amenities) {
    await prisma.amenity.upsert({ where: { key: a.key }, update: a, create: a });
  }

  // Demo company + super-user
  const company = await prisma.company.upsert({
    where: { slug: 'msk-demo' },
    update: {},
    create: { name: 'MSK Demo', slug: 'msk-demo', country: 'GB' },
  });

  const pinHash = await argon2.hash('1234');
  await prisma.user.upsert({
    where: { email: 'super@msk.local' },
    update: {},
    create: {
      email: 'super@msk.local',
      phone: '+10000000000',
      firstName: 'Super',
      lastName: 'User',
      fullName: 'Super User',
      role: UserRole.SUPER_USER,
      primaryRole: UserRole.SUPER_USER,
      authProvider: AuthProvider.PIN,
      companyId: company.id,
      emailVerified: true,
      credentials: {
        create: { provider: AuthProvider.PIN, secretHash: pinHash },
      },
    },
  });

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
