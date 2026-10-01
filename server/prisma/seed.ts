/**
 * Guardian Transit seed data.
 *
 * Every account below is a DEVELOPMENT account and is clearly marked as such.
 * They exist so the app can be exercised end-to-end immediately after install.
 *
 *   student   maya@student.test      / Student123
 *   parent    elena@parent.test      / Parent123
 *   driver    ramon@driver.test      / Driver123   (verified, online)
 *   driver    jose@driver.test       / Driver123   (verified, online)
 *   driver    paolo@driver.test      / Driver123   (pending review)
 *   admin     admin@guardian.test    / Admin1234
 *
 * Run: npm run db:seed --workspace server
 */
import {
  PrismaClient,
  SafetyReportCategory,
  VerificationStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptPin } from '../src/services/rides';

const prisma = new PrismaClient();

const SCHOOL = {
  label: 'San Isidro Academy · Gate A',
  address: 'San Isidro Academy, Gate A, San Roque',
  lat: 14.5995,
  lng: 120.9842,
};

const HOME = {
  label: '18 Mabini St, San Roque',
  address: '18 Mabini St, San Roque, Metro Manila',
  lat: 14.6071,
  lng: 120.9912,
};

const PLAZA = {
  label: 'City Plaza',
  address: 'Rizal Avenue, San Roque',
  lat: 14.6024,
  lng: 120.9876,
};

async function upsertUser(input: {
  phone: string;
  email?: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'STUDENT' | 'PARENT' | 'DRIVER' | 'ADMIN';
  status?: 'PENDING' | 'ACTIVE';
  avatarUrl?: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return prisma.user.upsert({
    where: { phone: input.phone },
    update: { passwordHash, status: input.status ?? 'ACTIVE' },
    create: {
      phone: input.phone,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: input.status ?? 'ACTIVE',
      avatarUrl: input.avatarUrl ?? null,
      lastLoginAt: new Date(),
    },
  });
}

function daysAgo(days: number, hour = 7, minute = 30): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function main(): Promise<void> {
  console.log('Seeding Guardian Transit…');

  // ---------------------------------------------------------------- config
  await prisma.systemConfig.upsert({
    where: { key: 'hotline.emergency' },
    update: {},
    create: {
      key: 'hotline.emergency',
      label: 'Emergency hotline',
      group: 'hotlines',
      description: 'Police, fire and ambulance — use when there is immediate danger to life.',
      value: { number: '911', available24h: true },
    },
  });
  await prisma.systemConfig.upsert({
    where: { key: 'hotline.dispatch' },
    update: {},
    create: {
      key: 'hotline.dispatch',
      label: 'Guardian Transit dispatch',
      group: 'hotlines',
      description: '24/7 operations desk — ride issues, driver concerns and live trip support.',
      value: { number: '+63 917 555 0100', available24h: true },
    },
  });
  await prisma.systemConfig.upsert({
    where: { key: 'hotline.safety' },
    update: {},
    create: {
      key: 'hotline.safety',
      label: 'Student safety desk',
      group: 'hotlines',
      description: 'Reports about driver behaviour, vehicle condition or route deviations.',
      value: { number: '+63 917 555 0111', available24h: false },
    },
  });
  await prisma.systemConfig.upsert({
    where: { key: 'sos.message' },
    update: {},
    create: {
      key: 'sos.message',
      label: 'SOS message',
      group: 'sos',
      value: {
        text: 'I need help. My live location is being shared with the Guardian Transit safety desk.',
      },
    },
  });
  await prisma.systemConfig.upsert({
    where: { key: 'contact.email' },
    update: {},
    create: {
      key: 'contact.email',
      label: 'Support email',
      group: 'contact',
      value: { text: 'safety@guardiantransit.app' },
    },
  });

  // ---------------------------------------------------------------- people
  const student = await upsertUser({
    phone: '+639175550148',
    email: 'maya@student.test',
    password: 'Student123',
    firstName: 'Maya',
    lastName: 'Santos',
    role: 'STUDENT',
    avatarUrl: '/images/maya.png',
  });

  const studentProfile = await prisma.studentProfile.upsert({
    where: { userId: student.id },
    update: {},
    create: {
      userId: student.id,
      studentCode: 'SIA-2026-0418',
      school: 'San Isidro Academy',
      grade: 'Grade 11',
      homeAddress: HOME.address,
      homeLat: HOME.lat,
      homeLng: HOME.lng,
      photoUrl: '/images/maya.png',
    },
  });

  const parent = await upsertUser({
    phone: '+639175550182',
    email: 'elena@parent.test',
    password: 'Parent123',
    firstName: 'Elena',
    lastName: 'Santos',
    role: 'PARENT',
    avatarUrl: '/images/elena.png',
  });

  const parentProfile = await prisma.parentProfile.upsert({
    where: { userId: parent.id },
    update: {},
    create: { userId: parent.id, address: HOME.address, preferredContact: 'PHONE' },
  });

  const admin = await upsertUser({
    phone: '+639175550100',
    email: 'admin@guardian.test',
    password: 'Admin1234',
    firstName: 'Guardian',
    lastName: 'Operations',
    role: 'ADMIN',
  });

  // ---------------------------------------------------------------- drivers
  const driverSpecs = [
    {
      phone: '+639175550201',
      email: 'ramon@driver.test',
      firstName: 'Ramon',
      lastName: 'Cruz',
      license: 'NCR-DL-0918234',
      online: true,
      status: 'VERIFIED' as VerificationStatus,
      rating: 4.9,
      trips: 412,
      lat: 14.5978,
      lng: 120.9859,
      vehicle: {
        nickname: 'BaoBao',
        make: 'Toyota',
        model: 'Avanza',
        color: 'Blue',
        plate: 'BB 2048',
        code: 'GT-014',
        capacity: 4,
      },
    },
    {
      phone: '+639175550202',
      email: 'jose@driver.test',
      firstName: 'Jose',
      lastName: 'Reyes',
      license: 'NCR-DL-0774120',
      online: true,
      status: 'VERIFIED' as VerificationStatus,
      rating: 4.8,
      trips: 287,
      lat: 14.6041,
      lng: 120.9803,
      vehicle: {
        nickname: 'BaoBao',
        make: 'Suzuki',
        model: 'Ertiga',
        color: 'Silver',
        plate: 'BB 3061',
        code: 'GT-021',
        capacity: 4,
      },
    },
    {
      phone: '+639175550203',
      email: 'paolo@driver.test',
      firstName: 'Paolo',
      lastName: 'Garcia',
      license: 'NCR-DL-0551902',
      online: false,
      status: 'PENDING' as VerificationStatus,
      rating: 0,
      trips: 0,
      lat: null,
      lng: null,
      vehicle: {
        nickname: 'BaoBao',
        make: 'Honda',
        model: 'Mobilio',
        color: 'White',
        plate: 'BB 1186',
        code: 'GT-008',
        capacity: 4,
      },
    },
  ];

  const drivers: Array<{ userId: string; driverId: string; vehicleId: string }> = [];

  for (const spec of driverSpecs) {
    const user = await upsertUser({
      phone: spec.phone,
      email: spec.email,
      password: 'Driver123',
      firstName: spec.firstName,
      lastName: spec.lastName,
      role: 'DRIVER',
    });

    const profile = await prisma.driverProfile.upsert({
      where: { userId: user.id },
      update: {
        isOnline: spec.online,
        overallStatus: spec.status,
        backgroundCheckStatus: spec.status,
        rating: spec.rating,
        totalTrips: spec.trips,
        completedTrips: spec.trips,
        lat: spec.lat,
        lng: spec.lng,
        verifiedAt: spec.status === 'VERIFIED' ? new Date() : null,
      },
      create: {
        userId: user.id,
        licenseNumber: spec.license,
        licenseExpiry: new Date('2028-06-30'),
        licenseClass: 'Professional',
        address: HOME.address,
        isOnline: spec.online,
        overallStatus: spec.status,
        backgroundCheckStatus: spec.status,
        rating: spec.rating,
        totalTrips: spec.trips,
        completedTrips: spec.trips,
        lat: spec.lat,
        lng: spec.lng,
        lastLocationAt: spec.lat ? new Date() : null,
        verifiedAt: spec.status === 'VERIFIED' ? new Date() : null,
      },
    });

    const vehicle = await prisma.vehicle.upsert({
      where: { plateNumber: spec.vehicle.plate },
      update: { status: spec.status, isActive: true },
      create: {
        driverId: profile.id,
        nickname: spec.vehicle.nickname,
        make: spec.vehicle.make,
        model: spec.vehicle.model,
        color: spec.vehicle.color,
        plateNumber: spec.vehicle.plate,
        capacity: spec.vehicle.capacity,
        status: spec.status,
        isActive: true,
      },
    });

    for (const docType of ['IDENTITY', 'GOVERNMENT', 'BACKGROUND'] as const) {
      await prisma.driverVerification.upsert({
        where: { driverId_docType: { driverId: profile.id, docType } },
        update: { status: spec.status, reviewedAt: new Date(), reviewedById: admin.id },
        create: {
          driverId: profile.id,
          docType,
          status: spec.status,
          reference: `${docType.slice(0, 3)}-${spec.license.slice(-6)}`,
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      });
    }

    for (const doc of ['Registration', 'Insurance', 'Inspection']) {
      await prisma.vehicleVerification.upsert({
        where: { vehicleId_docType: { vehicleId: vehicle.id, docType: doc } },
        update: { status: spec.status, reviewedAt: new Date(), reviewedById: admin.id },
        create: {
          vehicleId: vehicle.id,
          docType: doc,
          status: spec.status,
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      });
    }

    drivers.push({ userId: user.id, driverId: profile.id, vehicleId: vehicle.id });
  }

  const [ramon, jose] = drivers;

  // ------------------------------------------------------------- connection
  await prisma.guardianConnection.upsert({
    where: {
      guardianUserId_studentId: {
        guardianUserId: parent.id,
        studentId: studentProfile.id,
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      guardianUserId: parent.id,
      studentId: studentProfile.id,
      requestedById: parent.id,
      status: 'ACTIVE',
      respondedAt: new Date(),
      note: 'Parent/guardian of Maya Santos.',
    },
  });

  // -------------------------------------------------------- saved locations
  const savedLocations = [
    { kind: 'SCHOOL', ...SCHOOL },
    { kind: 'HOME', ...HOME },
    { kind: 'OTHER', ...PLAZA },
  ];
  for (const location of savedLocations) {
    const existing = await prisma.savedLocation.findFirst({
      where: { studentId: studentProfile.id, label: location.label },
    });
    if (!existing) {
      await prisma.savedLocation.create({
        data: { studentId: studentProfile.id, ...location },
      });
    }
  }

  // ------------------------------------------------------------------ rides
  const existingRides = await prisma.ride.count({ where: { studentId: studentProfile.id } });

  if (existingRides === 0) {
    const completedCodes = ['GT-0930', 'GT-0929'];
    const totalCompleted = 32;

    for (let index = 0; index < totalCompleted; index += 1) {
      const reverse = index % 2 === 0;
      const from = reverse ? SCHOOL : HOME;
      const to = reverse ? HOME : SCHOOL;
      const dayOffset = index + 1;
      const requested = daysAgo(dayOffset, reverse ? 15 : 6, reverse ? 40 : 55);
      const completed = new Date(requested.getTime() + (18 + (index % 7)) * 60_000);
      const code = completedCodes[index] ?? `GT-${String(928 - index).padStart(4, '0')}`;
      const fare = 45 + ((index * 3) % 4);

      const ride = await prisma.ride.create({
        data: {
          code,
          studentId: studentProfile.id,
          parentId: index < 5 ? parentProfile.id : null,
          driverId: index % 3 === 0 ? jose.driverId : ramon.driverId,
          vehicleId: index % 3 === 0 ? jose.vehicleId : ramon.vehicleId,
          status: 'COMPLETED',
          pickupLabel: from.label,
          pickupAddress: from.address,
          pickupLat: from.lat,
          pickupLng: from.lng,
          destinationLabel: to.label,
          destinationAddress: to.address,
          destinationLat: to.lat,
          destinationLng: to.lng,
          fare,
          distanceKm: 1.4 + ((index % 5) * 0.2),
          durationMin: 8 + (index % 5),
          pinHash: null,
          requestedAt: requested,
          acceptedAt: new Date(requested.getTime() + 60_000),
          arrivedAt: new Date(requested.getTime() + 8 * 60_000),
          verifiedAt: new Date(requested.getTime() + 9 * 60_000),
          startedAt: new Date(requested.getTime() + 10 * 60_000),
          completedAt: completed,
          rating: index < 6 ? 5 - (index % 2) : null,
        },
      });

      await prisma.rideEvent.createMany({
        data: [
          { rideId: ride.id, type: 'REQUESTED', message: 'Ride requested.', createdAt: requested },
          {
            rideId: ride.id,
            type: 'DRIVER_ASSIGNED',
            message: 'Driver accepted the ride.',
            createdAt: new Date(requested.getTime() + 60_000),
          },
          {
            rideId: ride.id,
            type: 'DRIVER_ARRIVED',
            message: 'Driver arrived at pickup.',
            createdAt: new Date(requested.getTime() + 8 * 60_000),
          },
          {
            rideId: ride.id,
            type: 'PIN_VERIFIED',
            message: 'Pickup PIN verified.',
            createdAt: new Date(requested.getTime() + 9 * 60_000),
          },
          {
            rideId: ride.id,
            type: 'TRIP_STARTED',
            message: 'Trip started.',
            createdAt: new Date(requested.getTime() + 10 * 60_000),
          },
          { rideId: ride.id, type: 'TRIP_COMPLETED', message: 'Arrived safely.', createdAt: completed },
        ],
      });

      await prisma.rideLocation.createMany({
        data: Array.from({ length: 6 }).map((_, step) => ({
          rideId: ride.id,
          lat: from.lat + ((to.lat - from.lat) * step) / 5,
          lng: from.lng + ((to.lng - from.lng) * step) / 5,
          speedKph: 22 + step,
          recordedAt: new Date(requested.getTime() + (10 + step) * 60_000),
        })),
      });

      // Index 0 is the most recent ride, so its balance must be the highest.
      const balanceAfter = totalCompleted - index;
      await prisma.guardianPoint.create({
        data: {
          studentId: studentProfile.id,
          rideId: ride.id,
          delta: 1,
          reason: 'RIDE_COMPLETED',
          balanceAfter,
          note: `Ride ${ride.code} completed`,
          createdAt: completed,
        },
      });
    }

    // ---------------------------------------------------------- active ride
    const requested = new Date(Date.now() - 6 * 60_000);
    const active = await prisma.ride.create({
      data: {
        code: 'GT-1001',
        studentId: studentProfile.id,
        parentId: parentProfile.id,
        driverId: ramon.driverId,
        vehicleId: ramon.vehicleId,
        status: 'DRIVER_ASSIGNED',
        pickupLabel: SCHOOL.label,
        pickupAddress: SCHOOL.address,
        pickupLat: SCHOOL.lat,
        pickupLng: SCHOOL.lng,
        destinationLabel: HOME.label,
        destinationAddress: HOME.address,
        destinationLat: HOME.lat,
        destinationLng: HOME.lng,
        fare: 45,
        distanceKm: 1.4,
        durationMin: 8,
        pinHash: null,
        requestedAt: requested,
        acceptedAt: new Date(requested.getTime() + 45_000),
      },
    });

    const pin = '482913';
    await prisma.ride.update({ where: { id: active.id }, data: { pinHash: encryptPin(pin) } });

    await prisma.rideEvent.createMany({
      data: [
        { rideId: active.id, type: 'REQUESTED', message: 'Ride requested.', createdAt: requested },
        {
          rideId: active.id,
          type: 'DRIVER_ASSIGNED',
          message: 'Ramon Cruz accepted the ride and is on the way.',
          createdAt: new Date(requested.getTime() + 45_000),
        },
      ],
    });

    await prisma.rideLocation.createMany({
      data: Array.from({ length: 4 }).map((_, step) => ({
        rideId: active.id,
        lat: SCHOOL.lat + 0.0012 * (step + 1),
        lng: SCHOOL.lng - 0.0008 * (step + 1),
        speedKph: 18 + step * 2,
        recordedAt: new Date(Date.now() - (3 - step) * 60_000),
      })),
    });

    await prisma.driverProfile.update({
      where: { id: ramon.driverId },
      data: { lat: SCHOOL.lat + 0.0048, lng: SCHOOL.lng - 0.0032, lastLocationAt: new Date() },
    });

    console.log(`  · 32 completed rides (32 Guardian Points) + active ride ${active.code}`);
  }

  // ---------------------------------------------------------- notifications
  const notificationCount = await prisma.notification.count({
    where: { userId: student.id },
  });
  if (notificationCount === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: student.id,
          type: 'RIDE_ACCEPTED',
          title: 'Driver on the way',
          body: 'Ramon Cruz accepted your ride and is heading to Gate A.',
          data: { rideCode: 'GT-1001' },
        },
        {
          userId: student.id,
          type: 'REWARD_EARNED',
          title: 'Keep going — 32 of 50 points',
          body: '18 more completed rides unlocks 1 FREE RIDE.',
        },
        {
          userId: student.id,
          type: 'SYSTEM',
          title: 'Welcome to Guardian Transit',
          body: 'Verified drivers, live guardian monitoring and PIN-protected pickups.',
        },
        {
          userId: parent.id,
          type: 'TRIP_UPDATE',
          title: 'Maya’s ride is active',
          body: 'Live tracking is available from your dashboard.',
          data: { rideCode: 'GT-1001' },
        },
        {
          userId: parent.id,
          type: 'GUARDIAN_CONNECTED',
          title: 'Guardian access granted',
          body: 'You can now follow Maya’s rides in real time.',
        },
        {
          userId: admin.id,
          type: 'VERIFICATION_UPDATE',
          title: 'Driver waiting for review',
          body: 'Paolo Garcia submitted identity, government and vehicle documents.',
        },
      ],
    });
  }

  // -------------------------------------------------------- safety reports
  const reportCount = await prisma.safetyReport.count();
  if (reportCount === 0) {
    await prisma.safetyReport.create({
      data: {
        reporterId: parent.id,
        category: 'UNEXPECTED_DELAY' as SafetyReportCategory,
        subject: 'Pickup was 12 minutes late on Monday',
        description:
          'The driver arrived at Gate A twelve minutes after the scheduled pickup time and did not notify the guardian.',
        severity: 'LOW',
        status: 'NEW',
      },
    });
    await prisma.safetyReport.create({
      data: {
        reporterId: student.id,
        category: 'HARSH_DRIVING' as SafetyReportCategory,
        subject: 'Hard braking on Rizal Avenue',
        description:
          'The vehicle braked sharply twice while approaching the plaza crossing. Everything was fine but it felt unsafe.',
        severity: 'MEDIUM',
        status: 'UNDER_REVIEW',
        assignedToId: admin.id,
        resolution: 'Coaching session scheduled with the driver.',
      },
    });
    await prisma.safetyReport.create({
      data: {
        reporterId: admin.id,
        authoredById: admin.id,
        category: 'VEHICLE_CONDITION' as SafetyReportCategory,
        subject: 'Interior light not working (GT-021)',
        description: 'Reported during the weekly inspection. Replaced under warranty.',
        severity: 'LOW',
        status: 'RESOLVED',
        assignedToId: admin.id,
        resolution: 'Interior lamp assembly replaced on site.',
        resolvedAt: new Date(),
      },
    });
  }

  // --------------------------------------------------------- emergency log
  const emergencyCount = await prisma.emergencyEvent.count();
  if (emergencyCount === 0) {
    await prisma.emergencyEvent.create({
      data: {
        raisedById: student.id,
        driverId: jose.driverId,
        type: 'VEHICLE_BREAKDOWN',
        message: 'Rear tyre went flat near the public market.',
        lat: PLAZA.lat,
        lng: PLAZA.lng,
        hotlineNumber: '+63 917 555 0100',
        hotlineLabel: 'Guardian Transit dispatch',
        guardianContact: '+63 917 555 0182',
        sharedWithGuardian: true,
        status: 'RESOLVED',
        resolutionNote: 'Spare fitted on site; student reached home safely.',
        createdAt: daysAgo(4, 16, 10),
        resolvedAt: daysAgo(4, 17, 5),
      },
    });
  }

  const [pointBalance, rideTotal, userTotal] = await Promise.all([
    prisma.guardianPoint.findFirst({
      where: { studentId: studentProfile.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ride.count(),
    prisma.user.count(),
  ]);

  console.log(`  · ${userTotal} users, ${rideTotal} rides`);
  console.log(`  · Maya’s Guardian Points balance: ${pointBalance?.balanceAfter ?? 0}/50`);
  console.log('\nDev accounts (development only):');
  console.log('  student  maya@student.test   +639175550148  / Student123');
  console.log('  parent   elena@parent.test   +639175550182  / Parent123');
  console.log('  driver   ramon@driver.test   +639175550201  / Driver123 (verified, online)');
  console.log('  driver   jose@driver.test    +639175550202  / Driver123 (verified, online)');
  console.log('  driver   paolo@driver.test   +639175550203  / Driver123 (pending review)');
  console.log('  admin    admin@guardian.test +639175550100  / Admin1234');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
