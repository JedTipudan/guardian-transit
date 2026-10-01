import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, forbidden, notFound, validateBody } from '../lib/errors';
import { authed } from '../middleware/auth';
import { bookingLimiter } from '../middleware/rateLimit';
import { sendOk, sendCreated } from '../lib/http';
import {
  ACTIVE_RIDE_STATUSES,
  createRide,
  acceptRide,
  declineRide,
  markArrived,
  verifyPickupPin,
  startTrip,
  completeTrip,
  cancelRide,
  rateRide,
  loadRide,
  rideInclude,
  serializeRide,
  canViewRide,
  decryptPin,
  quoteFare,
} from '../services/rides';
import { estimateRoute } from '../lib/geo';
import config from '../config/env';

const router = Router();

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

const coordinateSchema = z.object({
  label: z.string().trim().min(1, 'Give this place a name.').max(80),
  address: z.string().trim().min(2, 'Enter an address.').max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.get(
  '/saved-locations',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const studentId =
      typeof req.query.studentId === 'string' ? req.query.studentId : undefined;

    if (!studentId) throw badRequest('Choose a student first.');

    await assertStudentAccess(current.userId, current.role, studentId);

    const locations = await prisma.savedLocation.findMany({
      where: { studentId },
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
    });

    sendOk(res, {
      locations: locations.map((location) => ({
        id: location.id,
        kind: location.kind,
        label: location.label,
        address: location.address,
        lat: location.lat,
        lng: location.lng,
      })),
    });
  }),
);

router.post(
  '/saved-locations',
  validateBody(coordinateSchema.extend({ studentId: z.string().min(1), kind: z.string().max(20).default('OTHER') })),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof coordinateSchema> & { studentId: string; kind: string };

    await assertStudentAccess(current.userId, current.role, body.studentId);

    const location = await prisma.savedLocation.create({
      data: {
        studentId: body.studentId,
        kind: body.kind,
        label: body.label,
        address: body.address,
        lat: body.lat,
        lng: body.lng,
      },
    });

    sendCreated(res, { location });
  }),
);

router.delete(
  '/saved-locations/:id',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const location = await prisma.savedLocation.findUnique({ where: { id: req.params.id } });
    if (!location) throw notFound('Location not found.');
    await assertStudentAccess(current.userId, current.role, location.studentId);
    await prisma.savedLocation.delete({ where: { id: location.id } });
    sendOk(res, { deleted: true });
  }),
);

/**
 * Address search. Uses the configured geocoder when available and always
 * merges in the student's saved places so the picker works offline-ish.
 */
router.get(
  '/geocode',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    if (q.length < 2) {
      sendOk(res, { results: [] });
      return;
    }

    const needle = q.toLowerCase();
    const results: Array<{
      id: string;
      label: string;
      address: string;
      lat: number;
      lng: number;
      source: 'saved' | 'places' | 'geocoder';
    }> = [];

    if (studentId) {
      const saved = await prisma.savedLocation.findMany({ where: { studentId } });
      for (const location of saved) {
        if (
          location.label.toLowerCase().includes(needle) ||
          location.address.toLowerCase().includes(needle)
        ) {
          results.push({
            id: location.id,
            label: location.label,
            address: location.address,
            lat: location.lat,
            lng: location.lng,
            source: 'saved',
          });
        }
      }
    }

    for (const place of KNOWN_PLACES) {
      if (
        place.label.toLowerCase().includes(needle) ||
        place.address.toLowerCase().includes(needle)
      ) {
        results.push({ ...place, source: 'places' });
      }
    }

    if (results.length < 6 && config.map.geocodeUrl && config.map.provider !== 'none') {
      try {
        const url = new URL('/search', config.map.geocodeUrl);
        url.searchParams.set('q', q);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('limit', '5');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'GuardianTransit/1.0 (student transport safety)' },
        });
        clearTimeout(timer);
        if (response.ok) {
          const json = (await response.json()) as Array<{
            place_id: number;
            display_name: string;
            lat: string;
            lon: string;
          }>;
          for (const item of json) {
            results.push({
              id: `geo:${item.place_id}`,
              label: item.display_name.split(',')[0],
              address: item.display_name,
              lat: Number(item.lat),
              lng: Number(item.lon),
              source: 'geocoder',
            });
          }
        }
      } catch {
        /* geocoder unreachable — saved places and local hints still work */
      }
    }

    sendOk(res, { results: results.slice(0, 8) });
  }),
);

export const KNOWN_PLACES: Array<{
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}> = [
  {
    id: 'place:san-isidro-academy',
    label: 'San Isidro Academy',
    address: 'San Isidro Academy, Gate A, San Roque',
    lat: 14.5995,
    lng: 120.9842,
  },
  {
    id: 'place:mabini-st',
    label: '18 Mabini St, San Roque',
    address: '18 Mabini St, San Roque, Metro Manila',
    lat: 14.6071,
    lng: 120.9912,
  },
  {
    id: 'place:city-plaza',
    label: 'City Plaza',
    address: 'Rizal Avenue, San Roque',
    lat: 14.6024,
    lng: 120.9876,
  },
  {
    id: 'place:public-market',
    label: 'Public Market',
    address: 'Market Road, San Roque',
    lat: 14.5962,
    lng: 121.0013,
  },
];

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

const quoteSchema = z.object({ pickup: coordinateSchema, destination: coordinateSchema });

router.post(
  '/quote',
  validateBody(quoteSchema),
  asyncHandler(async (req, res) => {
    const { pickup, destination } = req.body as z.infer<typeof quoteSchema>;

    const { distanceKm, durationMin } = estimateRoute(pickup, destination);
    const fare = quoteFare(distanceKm);

    sendOk(res, {
      distanceKm,
      durationMin,
      fare,
      currency: 'PHP',
      baseFare: 35,
      perKm: 11.5,
      minimumFare: 45,
    });
  }),
);

// ---------------------------------------------------------------------------
// Available verified drivers
// ---------------------------------------------------------------------------

router.get(
  '/available-drivers',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.pickupLat);
    const lng = Number(req.query.pickupLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw badRequest('Choose a pickup point to see nearby drivers.');
    }

    const drivers = await prisma.driverProfile.findMany({
      where: {
        overallStatus: 'VERIFIED',
        backgroundCheckStatus: 'VERIFIED',
        isOnline: true,
        user: { status: 'ACTIVE' },
        vehicles: { some: { status: 'VERIFIED', isActive: true } },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, phone: true } },
        vehicles: { where: { status: 'VERIFIED', isActive: true } },
      },
      take: 50,
    });

    const results = drivers
      .map((driver) => {
        const hasLocation = typeof driver.lat === 'number' && typeof driver.lng === 'number';
        const route = hasLocation
          ? estimateRoute({ lat: driver.lat!, lng: driver.lng! }, { lat, lng })
          : null;
        return {
          id: driver.id,
          name: `${driver.user.firstName} ${driver.user.lastName}`,
          avatarUrl: driver.user.avatarUrl,
          rating: driver.rating,
          completedTrips: driver.completedTrips,
          totalTrips: driver.totalTrips,
          verifiedAt: driver.verifiedAt,
          locationKnown: hasLocation,
          distanceKm: route?.distanceKm ?? null,
          etaMinutes: route?.durationMin ?? null,
          vehicle: driver.vehicles[0]
            ? {
                id: driver.vehicles[0].id,
                nickname: driver.vehicles[0].nickname,
                make: driver.vehicles[0].make,
                model: driver.vehicles[0].model,
                color: driver.vehicles[0].color,
                plateNumber: driver.vehicles[0].plateNumber,
              }
            : null,
        };
      })
      .sort((a, b) => {
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, 6);

    sendOk(res, { drivers: results });
  }),
);

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

const createRideSchema = z.object({
  studentId: z.string().min(1, 'Choose a student.'),
  driverId: z.string().min(1, 'Choose a driver.'),
  pickup: coordinateSchema,
  destination: coordinateSchema,
  useFreeRide: z.boolean().default(false),
});

router.post(
  '/',
  bookingLimiter,
  validateBody(createRideSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof createRideSchema>;

    await assertStudentAccess(current.userId, current.role, body.studentId);
    if (body.pickup.address === body.destination.address && body.pickup.lat === body.destination.lat) {
      throw badRequest('Pickup and destination must be different places.');
    }

    let parentId: string | null = null;
    if (current.role === 'PARENT') {
      const parent = await prisma.parentProfile.findUnique({ where: { userId: current.userId } });
      parentId = parent?.id ?? null;
      if (parentId) {
        const connection = await prisma.guardianConnection.findFirst({
          where: { guardianUserId: current.userId, studentId: body.studentId, status: 'ACTIVE' },
        });
        if (!connection) {
          throw forbidden('Link this student before booking a ride for them.');
        }
      }
    }

    const { ride, pin } = await createRide({
      studentId: body.studentId,
      actingUserId: current.userId,
      driverId: body.driverId,
      pickup: body.pickup,
      destination: body.destination,
      useFreeRide: body.useFreeRide,
      parentId,
    });

    sendCreated(res, { ride, pickupPin: pin });
  }),
);

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100);

    const where: Record<string, unknown> = {};

    if (current.role === 'DRIVER') {
      const driver = await prisma.driverProfile.findUnique({ where: { userId: current.userId } });
      if (!driver) throw notFound('Driver profile not found.');
      where.driverId = driver.id;
    } else if (current.role === 'STUDENT') {
      const student = await prisma.studentProfile.findUnique({ where: { userId: current.userId } });
      if (!student) throw notFound('Student profile not found.');
      where.studentId = student.id;
    } else if (current.role === 'PARENT') {
      if (studentId) {
        await assertStudentAccess(current.userId, 'PARENT', studentId);
        where.studentId = studentId;
      } else {
        const connections = await prisma.guardianConnection.findMany({
          where: { guardianUserId: current.userId, status: 'ACTIVE' },
          select: { studentId: true },
        });
        where.OR = [
          { parent: { userId: current.userId } },
          { studentId: { in: connections.map((c) => c.studentId) } },
        ];
      }
    } else if (studentId) {
      where.studentId = studentId;
    }

    if (status && status !== 'ALL') {
      if (status === 'ACTIVE') where.status = { in: ACTIVE_RIDE_STATUSES };
      else where.status = status;
    }

    const rides = await prisma.ride.findMany({
      where,
      include: rideInclude,
      orderBy: { requestedAt: 'desc' },
      take: limit,
    });

    sendOk(res, { rides: rides.map((ride) => serializeRide(ride)) });
  }),
);

router.get(
  '/active',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const where: Record<string, unknown> = { status: { in: ACTIVE_RIDE_STATUSES } };

    if (current.role === 'DRIVER') {
      const driver = await prisma.driverProfile.findUnique({ where: { userId: current.userId } });
      where.driverId = driver?.id ?? '__none__';
    } else if (current.role === 'STUDENT') {
      const student = await prisma.studentProfile.findUnique({ where: { userId: current.userId } });
      where.studentId = student?.id ?? '__none__';
    } else if (current.role === 'PARENT') {
      const connections = await prisma.guardianConnection.findMany({
        where: { guardianUserId: current.userId, status: 'ACTIVE' },
        select: { studentId: true },
      });
      where.OR = [
        { parent: { userId: current.userId } },
        { studentId: { in: connections.map((c) => c.studentId) } },
      ];
    }

    const ride = await prisma.ride.findFirst({
      where,
      include: rideInclude,
      orderBy: { requestedAt: 'desc' },
    });

    if (!ride) {
      sendOk(res, { ride: null });
      return;
    }

    sendOk(res, { ride: serializeRide(ride, { pin: visiblePin(ride, current) }) });
  }),
);

// ---------------------------------------------------------------------------
// Detail & tracking
// ---------------------------------------------------------------------------

function visiblePin(
  ride: Parameters<typeof serializeRide>[0],
  actor: { userId: string; role: string },
): string | undefined {
  if (ride.verifiedAt) return undefined;
  const isStudent = ride.student.userId === actor.userId;
  const isParent = ride.parent?.userId === actor.userId;
  const isAdmin = actor.role === 'ADMIN';
  if (!isStudent && !isParent && !isAdmin) return undefined;
  return ride.pinHash ? decryptPin(ride.pinHash) ?? undefined : undefined;
}

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const ride = await loadRide(req.params.id);
    if (!canViewRide(ride, current)) throw notFound('Ride not found.');

    sendOk(res, { ride: serializeRide(ride, { pin: visiblePin(ride, current) }) });
  }),
);

router.get(
  '/:id/track',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const ride = await loadRide(req.params.id);
    if (!canViewRide(ride, current)) throw notFound('Ride not found.');

    const locations = await prisma.rideLocation.findMany({
      where: { rideId: ride.id },
      orderBy: { recordedAt: 'desc' },
      take: 200,
    });

    const route =
      locations.length > 0
        ? [...locations].reverse().map((point) => ({ lat: point.lat, lng: point.lng, at: point.recordedAt }))
        : [];

    sendOk(res, {
      ride: serializeRide(ride, { pin: visiblePin(ride, current) }),
      route,
      driver:
        ride.driver.lat !== null && ride.driver.lng !== null
          ? {
              lat: ride.driver.lat,
              lng: ride.driver.lng,
              lastSeen: ride.driver.lastLocationAt,
            }
          : null,
    });
  }),
);

// ---------------------------------------------------------------------------
// Driver transitions
// ---------------------------------------------------------------------------

router.post(
  '/:id/accept',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    if (current.role !== 'DRIVER') throw forbidden('Only the assigned driver can accept.');
    const ride = await acceptRide(req.params.id, current.userId);
    sendOk(res, { ride });
  }),
);

router.post(
  '/:id/decline',
  validateBody(z.object({ reason: z.string().trim().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    if (current.role !== 'DRIVER') throw forbidden('Only the assigned driver can decline.');
    const ride = await declineRide(req.params.id, current.userId, req.body.reason);
    sendOk(res, { ride });
  }),
);

router.post(
  '/:id/arrive',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    if (current.role !== 'DRIVER') throw forbidden('Only the assigned driver can do this.');
    const ride = await markArrived(req.params.id, current.userId);
    sendOk(res, { ride });
  }),
);

router.post(
  '/:id/verify-pin',
  validateBody(z.object({ pin: z.string().trim().min(4, 'Enter the pickup PIN.').max(12) })),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    if (current.role !== 'DRIVER') throw forbidden('Only the assigned driver can verify the PIN.');
    const result = await verifyPickupPin(req.params.id, current.userId, req.body.pin);
    sendOk(res, { ride: result.ride, attemptsLeft: result.attemptsLeft });
  }),
);

router.post(
  '/:id/start',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    if (current.role !== 'DRIVER') throw forbidden('Only the assigned driver can start the trip.');
    const ride = await startTrip(req.params.id, current.userId);
    sendOk(res, { ride });
  }),
);

router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    if (current.role !== 'DRIVER') throw forbidden('Only the assigned driver can complete the trip.');
    const ride = await completeTrip(req.params.id, current.userId);
    sendOk(res, { ride });
  }),
);

router.post(
  '/:id/cancel',
  validateBody(
    z.object({
      reason: z.string().trim().min(3, 'Tell us why this ride is being cancelled.').max(200),
    }),
  ),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const ride = await cancelRide(req.params.id, current, req.body.reason);
    sendOk(res, { ride });
  }),
);

router.post(
  '/:id/rate',
  validateBody(
    z.object({
      rating: z.number().int().min(1, 'Pick a rating.').max(5),
      note: z.string().trim().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const ride = await rateRide(req.params.id, current, req.body.rating, req.body.note);
    sendOk(res, { ride });
  }),
);

// ---------------------------------------------------------------------------
// Access helper
// ---------------------------------------------------------------------------

export async function assertStudentAccess(
  userId: string,
  role: string,
  studentId: string,
): Promise<void> {
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) throw notFound('Student not found.');

  if (role === 'ADMIN') return;
  if (role === 'STUDENT') {
    if (student.userId !== userId) throw notFound('Student not found.');
    return;
  }
  if (role === 'PARENT') {
    const connection = await prisma.guardianConnection.findFirst({
      where: { guardianUserId: userId, studentId, status: 'ACTIVE' },
    });
    if (!connection) throw forbidden('Link this student to your account first.');
    return;
  }
  throw forbidden('Your account cannot access this student’s rides.');
}

export default router;
