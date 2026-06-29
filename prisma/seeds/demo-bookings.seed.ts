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
import * as argon2 from 'argon2';

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

  // 5b. Property team — operator + staff + supplier, so chat is testable
  //     across roles. All APP lane, password "demo1234".
  const pwHash = await argon2.hash('demo1234');
  const teamPassword = {
    accountKind: AccountKind.APP,
    authProvider: AuthProvider.PASSWORD,
    isActive: true,
    emailVerified: true,
  };

  const operator = await prisma.user.upsert({
    where: { User_email_role_key: { email: 'operator@demo.local', role: UserRole.ADMIN } },
    update: { isActive: true, companyId: company.id },
    create: {
      email: 'operator@demo.local',
      firstName: 'Olivia',
      lastName: 'Operator',
      fullName: 'Olivia Operator',
      role: UserRole.ADMIN,
      primaryRole: UserRole.ADMIN,
      companyId: company.id,
      ...teamPassword,
      credentials: { create: { provider: AuthProvider.PASSWORD, secretHash: pwHash } },
    },
  });

  const staff = await prisma.user.upsert({
    where: { User_email_role_key: { email: 'staff@demo.local', role: UserRole.STAFF } },
    update: { isActive: true, companyId: company.id },
    create: {
      email: 'staff@demo.local',
      firstName: 'Sam',
      lastName: 'Staff',
      fullName: 'Sam Staff',
      role: UserRole.STAFF,
      primaryRole: UserRole.STAFF,
      companyId: company.id,
      ...teamPassword,
      staffProfile: { create: { position: 'Housekeeping' } },
      credentials: { create: { provider: AuthProvider.PASSWORD, secretHash: pwHash } },
    },
  });

  const supplier = await prisma.user.upsert({
    where: { User_email_role_key: { email: 'supplier@demo.local', role: UserRole.SUPPLIER } },
    update: { isActive: true },
    create: {
      email: 'supplier@demo.local',
      firstName: 'Riley',
      lastName: 'Supplier',
      fullName: 'Riley Supplier',
      role: UserRole.SUPPLIER,
      primaryRole: UserRole.SUPPLIER,
      ...teamPassword,
      supplierProfile: { create: { companyName: 'Demo Supplies Ltd' } },
      credentials: { create: { provider: AuthProvider.PASSWORD, secretHash: pwHash } },
    },
  });

  // Housekeeping department (matches the guest "Housekeeping" category) with
  // the staff member as a head, so guest category routing has a dept to hit.
  const department = await prisma.department.upsert({
    where: { companyId_slug: { companyId: company.id, slug: 'housekeeping' } },
    update: {},
    create: { companyId: company.id, name: 'Housekeeping', slug: 'housekeeping' },
  });
  await prisma.departmentMember.upsert({
    where: { departmentId_userId: { departmentId: department.id, userId: staff.id } },
    update: {},
    create: { departmentId: department.id, userId: staff.id, isHead: true },
  });

  // An order linking the supplier to the operator, so the supplier's chat
  // contact list surfaces the operator (supplier-initiated DM).
  await prisma.order.upsert({
    where: { number: 'ORD-DEMO-0001' },
    update: {},
    create: {
      number: 'ORD-DEMO-0001',
      supplierId: supplier.id,
      createdById: operator.id,
      totalAmount: new Prisma.Decimal('100.00'),
      currency: 'GBP',
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

  console.log('\nDemo guest: guest@demo.local — check-in code 100001 (or email OTP).');
  console.log('Demo team (email + password "demo1234", APP lane):');
  console.log('  operator@demo.local  (Property Operator / ADMIN)');
  console.log('  staff@demo.local     (Staff, Housekeeping dept)');
  console.log('  supplier@demo.local  (Supplier)');
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
