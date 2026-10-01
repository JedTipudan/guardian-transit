import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, notFound, validateBody } from '../lib/errors';
import { authed, requireRole } from '../middleware/auth';
import { sendOk } from '../lib/http';
import { rideInclude, serializeRide } from '../services/rides';
import { setConfig, getPublicConfig, HOTLINE_DEFAULTS } from '../services/systemConfig';
import { notify } from '../lib/notify';
import { emitToUser } from '../lib/socket';

const router = Router();
router.use(requireRole('ADMIN'));

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      users,
      pendingDriverChecks,
      pendingVehicleChecks,
      activeRides,
      completedToday,
      openEmergencies,
      newReports,
      onlineDrivers,
      ridesToday,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.driverVerification.count({
        where: { status: { in: ['PENDING', 'UNDER_REVIEW', 'REQUIRES_ACTION'] } },
      }),
      prisma.vehicleVerification.count({
        where: { status: { in: ['PENDING', 'UNDER_REVIEW', 'REQUIRES_ACTION'] } },
      }),
      prisma.ride.count({
        where: { status: { in: ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PIN_VERIFIED', 'IN_PROGRESS'] } },
      }),
      prisma.ride.count({ where: { status: 'COMPLETED', completedAt: { gte: startOfDay } } }),
      prisma.emergencyEvent.count({ where: { status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } } }),
      prisma.safetyReport.count({ where: { status: 'NEW' } }),
      prisma.driverProfile.count({ where: { isOnline: true, overallStatus: 'VERIFIED' } }),
      prisma.ride.count({ where: { requestedAt: { gte: startOfDay } } }),
    ]);

    sendOk(res, {
      totals: {
        users,
        pendingVerifications: pendingDriverChecks + pendingVehicleChecks,
        activeRides,
        completedToday,
        openEmergencies,
        newReports,
        onlineDrivers,
        ridesToday,
      },
      config: await getPublicConfig(),
    });
  }),
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === 'string' && req.query.role !== 'ALL' ? req.query.role : undefined;
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as never } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        studentProfile: true,
        parentProfile: true,
        driverProfile: { include: { vehicles: true, verifications: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    sendOk(res, {
      users: users.map((user) => ({
        id: user.id,
        role: user.role,
        status: user.status,
        name: `${user.firstName} ${user.lastName}`,
        phone: user.phone,
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        verification:
          user.role === 'DRIVER' ? (user.driverProfile?.overallStatus ?? 'PENDING') : null,
        studentCode: user.studentProfile?.studentCode ?? null,
        vehicleCount: user.driverProfile?.vehicles.length ?? 0,
      })),
    });
  }),
);

const userStatusSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: z.string().trim().max(300).optional(),
});

router.patch(
  '/users/:id/status',
  validateBody(userStatusSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof userStatusSchema>;
    if (req.params.id === current.userId) throw badRequest('You cannot change your own status here.');

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound('User not found.');

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { status: body.status },
    });

    if (body.status === 'SUSPENDED') {
      await prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (user.role === 'DRIVER') {
        await prisma.driverProfile.updateMany({
          where: { userId: user.id },
          data: { isOnline: false },
        });
      }
    }

    await notify({
      userId: user.id,
      type: 'SYSTEM',
      title: `Account ${body.status.toLowerCase()}`,
      body: body.reason ?? 'An administrator updated your account status.',
    });

    sendOk(res, { user: { id: updated.id, status: updated.status } });
  }),
);

// ---------------------------------------------------------------------------
// Verification workflow
// ---------------------------------------------------------------------------

router.get(
  '/verifications',
  asyncHandler(async (req, res) => {
    const status =
      typeof req.query.status === 'string' && req.query.status !== 'ALL'
        ? req.query.status
        : undefined;

    const drivers = await prisma.driverProfile.findMany({
      where: status ? { overallStatus: status as never } : {},
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, createdAt: true } },
        vehicles: { include: { verifications: true } },
        verifications: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const vehicleRows = await prisma.vehicle.findMany({
      where: status ? { status: status as never } : {},
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true } } } },
        verifications: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    sendOk(res, {
      drivers: drivers.map((driver) => ({
        id: driver.id,
        name: `${driver.user.firstName} ${driver.user.lastName}`,
        phone: driver.user.phone,
        email: driver.user.email,
        joinedAt: driver.user.createdAt,
        licenseNumber: driver.licenseNumber,
        licenseExpiry: driver.licenseExpiry,
        overallStatus: driver.overallStatus,
        backgroundCheckStatus: driver.backgroundCheckStatus,
        verifiedAt: driver.verifiedAt,
        checks: driver.verifications.map((entry) => ({
          id: entry.id,
          docType: entry.docType,
          status: entry.status,
          reference: entry.reference,
          notes: entry.notes,
          submittedAt: entry.submittedAt,
          reviewedAt: entry.reviewedAt,
        })),
        vehicles: driver.vehicles.map((vehicle) => ({
          id: vehicle.id,
          label: `${vehicle.nickname} · ${vehicle.color} ${vehicle.make} ${vehicle.model}`,
          plateNumber: vehicle.plateNumber,
          status: vehicle.status,
          verifications: vehicle.verifications,
        })),
      })),
      vehicles: vehicleRows.map((vehicle) => ({
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        nickname: vehicle.nickname,
        status: vehicle.status,
        driverName: `${vehicle.driver.user.firstName} ${vehicle.driver.user.lastName}`,
        checks: vehicle.verifications,
      })),
    });
  }),
);

const reviewSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REQUIRES_ACTION', 'REJECTED']),
  notes: z.string().trim().max(500).optional(),
  docType: z.enum(['IDENTITY', 'GOVERNMENT', 'VEHICLE', 'BACKGROUND']).optional(),
});

router.post(
  '/verifications/:driverId',
  validateBody(reviewSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof reviewSchema>;

    const driver = await prisma.driverProfile.findUnique({
      where: { id: req.params.driverId },
      include: { user: true, verifications: true, vehicles: { include: { verifications: true } } },
    });
    if (!driver) throw notFound('Driver not found.');

    if (body.docType) {
      await prisma.driverVerification.update({
        where: { driverId_docType: { driverId: driver.id, docType: body.docType } },
        data: {
          status: body.status,
          notes: body.notes ?? null,
          reviewedAt: new Date(),
          reviewedById: current.userId,
        },
      });
    } else {
      await prisma.driverVerification.updateMany({
        where: { driverId: driver.id },
        data: {
          status: body.status,
          notes: body.notes ?? null,
          reviewedAt: new Date(),
          reviewedById: current.userId,
        },
      });
      if (body.status === 'VERIFIED') {
        await prisma.driverVerification.update({
          where: { driverId_docType: { driverId: driver.id, docType: 'BACKGROUND' } },
          data: { status: 'VERIFIED', reviewedAt: new Date(), reviewedById: current.userId },
        });
      }
    }

    const checks = await prisma.driverVerification.findMany({ where: { driverId: driver.id } });
    const allVerified = checks.every((entry) => entry.status === 'VERIFIED');
    const anyRejected = checks.some((entry) => entry.status === 'REJECTED');
    const anyRequires = checks.some((entry) => entry.status === 'REQUIRES_ACTION');

    const overall = allVerified
      ? 'VERIFIED'
      : anyRejected
        ? 'REJECTED'
        : anyRequires
          ? 'REQUIRES_ACTION'
          : body.status === 'UNDER_REVIEW'
            ? 'UNDER_REVIEW'
            : 'PENDING';

    await prisma.driverProfile.update({
      where: { id: driver.id },
      data: {
        overallStatus: overall,
        backgroundCheckStatus: checks.find((c) => c.docType === 'BACKGROUND')?.status ?? 'PENDING',
        isOnline: overall === 'VERIFIED' ? driver.isOnline : false,
        verifiedAt: allVerified ? (driver.verifiedAt ?? new Date()) : null,
      },
    });

    await notify({
      userId: driver.user.id,
      type: 'VERIFICATION_UPDATE',
      title: `Verification ${overall.replace('_', ' ').toLowerCase()}`,
      body:
        body.notes ??
        (overall === 'VERIFIED'
          ? 'All checks passed — you can now go online and receive ride requests.'
          : 'Check your driver dashboard for the documents that need attention.'),
    });

    sendOk(res, { driverId: driver.id, overallStatus: overall });
  }),
);

const vehicleReviewSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REQUIRES_ACTION', 'REJECTED']),
  notes: z.string().trim().max(500).optional(),
});

router.post(
  '/verifications/vehicle/:vehicleId',
  validateBody(vehicleReviewSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof vehicleReviewSchema>;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.vehicleId },
      include: { driver: { include: { user: true } }, verifications: true },
    });
    if (!vehicle) throw notFound('Vehicle not found.');

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: body.status },
    });

    await prisma.vehicleVerification.updateMany({
      where: { vehicleId: vehicle.id },
      data: { status: body.status, notes: body.notes ?? null, reviewedAt: new Date(), reviewedById: current.userId },
    });

    const driverChecks = await prisma.driverVerification.findMany({ where: { driverId: vehicle.driverId } });
    const vehicleOk = body.status === 'VERIFIED';
    const checksOk = driverChecks.every((entry) => entry.status === 'VERIFIED');

    if (vehicleOk && checksOk) {
      await prisma.driverProfile.update({
        where: { id: vehicle.driverId },
        data: { overallStatus: 'VERIFIED', verifiedAt: new Date() },
      });
    }

    await notify({
      userId: vehicle.driver.user.id,
      type: 'VERIFICATION_UPDATE',
      title: `Vehicle ${body.status.replace('_', ' ').toLowerCase()}`,
      body: body.notes ?? `${vehicle.nickname} (${vehicle.plateNumber}) was reviewed.`,
    });

    sendOk(res, { vehicleId: vehicle.id, status: body.status });
  }),
);

// ---------------------------------------------------------------------------
// Rides
// ---------------------------------------------------------------------------

router.get(
  '/rides',
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status !== 'ALL') {
      where.status = req.query.status;
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      where.code = { contains: req.query.q.trim(), mode: 'insensitive' };
    }

    const rides = await prisma.ride.findMany({
      where,
      include: rideInclude,
      orderBy: { requestedAt: 'desc' },
      take: 60,
    });

    sendOk(res, { rides: rides.map((ride) => serializeRide(ride)) });
  }),
);

router.get(
  '/rides/:id',
  asyncHandler(async (req, res) => {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.id },
      include: {
        ...rideInclude,
        locations: { orderBy: { recordedAt: 'asc' }, take: 300 },
        emergencies: true,
        reports: true,
        point: true,
      },
    });
    if (!ride) throw notFound('Ride not found.');
    sendOk(res, {
      ride: serializeRide(ride),
      locations: ride.locations,
      emergencies: ride.emergencies,
      reports: ride.reports,
      points: ride.point,
    });
  }),
);

// ---------------------------------------------------------------------------
// Emergencies & reports
// ---------------------------------------------------------------------------

router.get(
  '/emergencies',
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status !== 'ALL') {
      where.status = req.query.status;
    }
    const emergencies = await prisma.emergencyEvent.findMany({
      where,
      include: {
        raisedBy: { select: { id: true, firstName: true, lastName: true, role: true, phone: true } },
        ride: { select: { id: true, code: true, status: true } },
        handledBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    sendOk(res, { emergencies });
  }),
);

// ---------------------------------------------------------------------------
// System configuration (hotlines, SOS copy)
// ---------------------------------------------------------------------------

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const publicConfig = await getPublicConfig();
    sendOk(res, {
      ...publicConfig,
      editableKeys: [
        ...HOTLINE_DEFAULTS.map((line) => ({ key: line.key, label: line.label })),
        { key: 'sos.message', label: 'SOS message' },
        { key: 'contact.email', label: 'Support email' },
      ],
    });
  }),
);

const configSchema = z.object({
  hotlines: z
    .array(
      z.object({
        key: z.string().min(3),
        label: z.string().min(2).max(80),
        number: z.string().trim().min(3).max(40),
        description: z.string().max(240).optional(),
        available24h: z.boolean().optional(),
      }),
    )
    .optional(),
  sosMessage: z.string().trim().min(10).max(500).optional(),
  supportEmail: z.string().trim().email('Enter a valid support email.').optional(),
});

router.put(
  '/config',
  validateBody(configSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof configSchema>;

    if (body.hotlines) {
      for (const line of body.hotlines) {
        await setConfig(
          line.key,
          line.label,
          {
            number: line.number,
            description: line.description,
            available24h: line.available24h ?? true,
          },
          { group: 'hotlines', updatedById: current.userId },
        );
      }
    }
    if (body.sosMessage) {
      await setConfig('sos.message', 'SOS message', { text: body.sosMessage }, {
        group: 'sos',
        updatedById: current.userId,
      });
    }
    if (body.supportEmail) {
      await setConfig('contact.email', 'Support email', { text: body.supportEmail }, {
        group: 'contact',
        updatedById: current.userId,
      });
    }

    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    for (const admin of admins) {
      emitToUser(admin.id, 'config:updated', {});
    }

    sendOk(res, await getPublicConfig());
  }),
);

// ---------------------------------------------------------------------------
// Points adjustments
// ---------------------------------------------------------------------------

const adjustSchema = z.object({
  studentId: z.string().min(1),
  delta: z.number().int().min(-100).max(100),
  note: z.string().trim().min(3).max(200),
});

router.post(
  '/points/adjust',
  validateBody(adjustSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof adjustSchema>;
    const student = await prisma.studentProfile.findUnique({ where: { id: body.studentId } });
    if (!student) throw notFound('Student not found.');
    if (body.delta === 0) throw badRequest('Choose a non-zero adjustment.');

    const latest = await prisma.guardianPoint.findFirst({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
    });
    const balance = Math.max(0, (latest?.balanceAfter ?? 0) + body.delta);

    const entry = await prisma.guardianPoint.create({
      data: {
        studentId: student.id,
        delta: body.delta,
        reason: 'ADMIN_ADJUSTMENT',
        balanceAfter: balance,
        note: body.note,
      },
    });

    await notify({
      userId: student.userId,
      type: 'REWARD_EARNED',
      title: 'Guardian Points updated',
      body: `${body.delta > 0 ? '+' : ''}${body.delta} points — ${body.note}. New balance: ${balance}.`,
    });

    sendOk(res, { entry, balance });
  }),
);

export default router;
