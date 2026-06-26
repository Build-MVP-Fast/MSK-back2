/* eslint-disable no-console */
/**
 * Demo bookings seed — populates a guest account + property + a few
 * bookings (with 6-digit check-in codes) so the mobile Guest Home page
 * has real data to render.
 *
 * Idempotent: every row is upserted by a unique key, so this can be
 * re-run safely. Run with:  npm run prisma:seed-demo
 *
 * Sign in to the app afterwards via the check-in-code screen using
 * 100001 (active stay), or via email OTP with guest@demo.local
 * (the OTP code is printed to the backend console as [OTP/LOGIN] code=…).
 */
import {
  PrismaClient,
  Prisma,
  UserRole,
  AccountKind,
  AuthProvider,
  BookingStatus,
  BookingSource,
  PropertyStatus,
  RoomStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

/** A date `days` from now (negative = past), normalised to midnight. */
function dayOffset(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log('Seeding demo bookings…');

  // 1. Company — reuse the demo company from the base seed, create if missing.
  const company = await prisma.company.upsert({
    where: { slug: 'msk-demo' },
    update: {},
    create: { name: 'MSK Demo', slug: 'msk-demo', country: 'GB' },
  });

  // 2. Property
  const property = await prisma.property.upsert({
    where: { slug: 'demo-residence' },
    update: { status: PropertyStatus.PUBLISHED },
    create: {
      companyId: company.id,
      name: 'Demo Residence',
      slug: 'demo-residence',
      description: 'A demo property for testing the guest experience.',
      status: PropertyStatus.PUBLISHED,
      email: 'info@demo.local',
      phone: '+44 20 7946 0000',
      city: 'London',
      country: 'GB',
      timezone: 'Europe/London',
      defaultCurrency: 'GBP',
      checkInTime: '15:00',
      checkOutTime: '11:00',
    },
  });

  // 3. Room type
  const roomType = await prisma.roomType.upsert({
    where: { propertyId_slug: { propertyId: property.id, slug: 'deluxe-suite' } },
    update: {},
    create: {
      propertyId: property.id,
      name: 'Deluxe Suite',
      slug: 'deluxe-suite',
      description: 'Spacious suite with a city view.',
      basePrice: new Prisma.Decimal('250.00'),
      currency: 'GBP',
      maxOccupancy: 4,
      maxAdults: 2,
      maxChildren: 2,
      bedConfig: '1 King + 1 Sofa bed',
    },
  });

  // 4. Rooms
  const room204 = await prisma.room.upsert({
    where: { propertyId_number: { propertyId: property.id, number: '204' } },
    update: {},
    create: {
      propertyId: property.id,
      roomTypeId: roomType.id,
      number: '204',
      floor: '2nd floor',
      status: RoomStatus.OCCUPIED,
    },
  });
  await prisma.room.upsert({
    where: { propertyId_number: { propertyId: property.id, number: '305' } },
    update: {},
    create: {
      propertyId: property.id,
      roomTypeId: roomType.id,
      number: '305',
      floor: '3rd floor',
      status: RoomStatus.AVAILABLE,
    },
  });

  // 5. Guest user — must be APP lane + active to log in.
  const guest = await prisma.user.upsert({
    where: {
      User_email_role_key: { email: 'guest@demo.local', role: UserRole.WEB_GUEST },
    },
    update: { isActive: true, emailVerified: true },
    create: {
      email: 'guest@demo.local',
      phone: '+44 7700 900000',
      firstName: 'Demo',
      lastName: 'Guest',
      fullName: 'Demo Guest',
      role: UserRole.WEB_GUEST,
      primaryRole: UserRole.WEB_GUEST,
      accountKind: AccountKind.APP,
      authProvider: AuthProvider.OTP_ONLY,
      isActive: true,
      emailVerified: true,
      companyId: company.id,
      guestProfile: { create: {} },
    },
  });

  // 6. Bookings — one per Guest Home state. Linked by both guestUserId
  //    and guestEmail so currentStay() surfaces them either way.
  const guestLink = {
    guestUserId: guest.id,
    guestEmail: guest.email!,
    guestFirstName: guest.firstName,
    guestLastName: guest.lastName,
  };

  const bookings = [
    {
      reference: 'MSK-2026-DEMO01',
      checkInCode: '100001',
      status: BookingStatus.CHECKED_IN,
      roomId: room204.id,
      checkIn: dayOffset(-1),
      checkOut: dayOffset(2),
      nights: 3,
      checkedInAt: new Date(),
      checkedOutAt: null as Date | null,
      totalAmount: '750.00',
    },
    {
      reference: 'MSK-2026-DEMO02',
      checkInCode: '100002',
      status: BookingStatus.CONFIRMED,
      roomId: null as string | null,
      checkIn: dayOffset(14),
      checkOut: dayOffset(17),
      nights: 3,
      checkedInAt: null as Date | null,
      checkedOutAt: null as Date | null,
      totalAmount: '750.00',
    },
    {
      reference: 'MSK-2026-DEMO03',
      checkInCode: '100003',
      status: BookingStatus.CHECKED_OUT,
      roomId: null as string | null,
      checkIn: dayOffset(-20),
      checkOut: dayOffset(-17),
      nights: 3,
      checkedInAt: dayOffset(-20),
      checkedOutAt: dayOffset(-17),
      totalAmount: '750.00',
    },
  ];

  for (const b of bookings) {
    const data = {
      propertyId: property.id,
      roomTypeId: roomType.id,
      roomId: b.roomId,
      ...guestLink,
      adults: 2,
      children: 0,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      status: b.status,
      source: BookingSource.APP,
      totalAmount: new Prisma.Decimal(b.totalAmount),
      currency: 'GBP',
      checkInCode: b.checkInCode,
      checkedInAt: b.checkedInAt,
      checkedOutAt: b.checkedOutAt,
    };
    await prisma.booking.upsert({
      where: { reference: b.reference },
      update: data,
      create: { reference: b.reference, ...data },
    });
    console.log(`  ${b.reference}  status=${b.status}  check-in code=${b.checkInCode}`);
  }

  console.log('\nDemo guest: guest@demo.local');
  console.log('Sign in with check-in code 100001 (active stay) or email OTP.');
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
