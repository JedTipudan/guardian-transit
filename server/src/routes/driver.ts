import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, notFound, validateBody } from '../lib/errors';
import { authed, requireRole } from '../middleware/auth';
import { sendOk } from '../lib/http';
import { ACTIVE_RIDE_STATUSES, rideInclude, serializeRide } from '../services/rides';
import type { RideStatus } from '@prisma/client';

const router = Router();
router.use(requireRole('DRIVER'));

async function currentDriver(userId: string) {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId },
    include: { user: true, vehicles: { orderBy: { createdAt: 'asc' } }, verifications: true },
  });
  if (!driver) throw notFound('Driver profile not found.');
  return driver;
}

/** Profile, verification status and today's numbers for the driver dashboard. */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const driver = await currentDriver(current.userId);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayTrips, pendingRequests, activeRide, todayEarnings] = await Promise.all([
      prisma.ride.count({
        where: { driverId: driver.id, status: 'COMPLETED', completedAt: { gte: startOfDay } },
      }),
      prisma.ride.count({ where: { driverId: driver.id, status: 'REQUESTED' } }),
      prisma.ride.findFirst({
        where: { driverId: driver.id, status: { in: ACTIVE_RIDE_STATUSES } },
        include: rideInclude,
      }),
      prisma.ride.aggregate({
        where: { driverId: driver.id, status: 'COMPLETED', completedAt: { gte: startOfDay } },
        _sum: { fare: true },
      }),
    ]);

    sendOk(res, {
      driver: {
        id: driver.id,
        name: `${driver.user.firstName} ${driver.user.lastName}`,
        phone: driver.user.phone,
        avatarUrl: driver.user.avatarUrl,
        isOnline: driver.isOnline,
        rating: driver.rating,
        totalTrips: driver.totalTrips,
        completedTrips: driver.completedTrips,
        overallStatus: driver.overallStatus,
        backgroundCheckStatus: driver.backgroundCheckStatus,
        verifiedAt: driver.verifiedAt,
        licenseNumber: driver.licenseNumber,
        licenseExpiry: driver.licenseExpiry,
        lastLocationAt: driver.lastLocationAt,
      },
      vehicles: driver.vehicles.map((vehicle) => ({
        id: vehicle.id,
        nickname: vehicle.nickname,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        plateNumber: vehicle.plateNumber,
        capacity: vehicle.capacity,
        status: vehicle.status,
        isActive: vehicle.isActive,
      })),
      verifications: driver.verifications.map((entry) => ({
        id: entry.id,
        docType: entry.docType,
        status: entry.status,
        notes: entry.notes,
        submittedAt: entry.submittedAt,
        reviewedAt: entry.reviewedAt,
      })),
      stats: {
        todayTrips,
        pendingRequests,
        todayEarnings: Number(todayEarnings._sum.fare ?? 0),
        activeRide: activeRide ? serializeRide(activeRide) : null,
      },
    });
  }),
);

const statusSchema = z.object({ isOnline: z.boolean() });

router.post(
  '/status',
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const driver = await currentDriver(current.userId);

    if (driver.overallStatus !== 'VERIFIED') {
      throw badRequest(
        'Your account must be verified by an admin before you can go online and receive ride requests.',
      );
    }
    const verifiedVehicle = driver.vehicles.some((vehicle) => vehicle.status === 'VERIFIED' && vehicle.isActive);
    if (!verifiedVehicle) {
      throw badRequest('Add and verify a vehicle before going online.');
    }

    const updated = await prisma.driverProfile.update({
      where: { id: driver.id },
      data: { isOnline: req.body.isOnline },
    });

    sendOk(res, { isOnline: updated.isOnline });
  }),
);

/** Ride requests waiting for this driver's decision. */
router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const driver = await currentDriver(current.userId);

    const requests = await prisma.ride.findMany({
      where: { driverId: driver.id, status: 'REQUESTED' },
      include: rideInclude,
      orderBy: { requestedAt: 'asc' },
    });

    sendOk(res, { requests: requests.map((ride) => serializeRide(ride)) });
  }),
);

router.get(
  '/active-ride',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const driver = await currentDriver(current.userId);

    const ride = await prisma.ride.findFirst({
      where: { driverId: driver.id, status: { in: ACTIVE_RIDE_STATUSES } },
      include: rideInclude,
      orderBy: { requestedAt: 'desc' },
    });

    sendOk(res, { ride: ride ? serializeRide(ride) : null });
  }),
);

/** Trip history for the driver, newest first. */
router.get(
  '/trips',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const driver = await currentDriver(current.userId);
    const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const rides = await prisma.ride.findMany({
      where: {
        driverId: driver.id,
        ...(status && status !== 'ALL' ? { status: status as RideStatus } : {}),
      },
      include: rideInclude,
      orderBy: { requestedAt: 'desc' },
      take: limit,
    });

    sendOk(res, { trips: rides.map((ride) => serializeRide(ride)) });
  }),
);

export default router;
