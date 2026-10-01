import { Router } from 'express';
import { z } from 'zod';
import type { EmergencyType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, notFound, validateBody } from '../lib/errors';
import { authed, requireAuth, requireRole } from '../middleware/auth';
import { sendOk, sendCreated } from '../lib/http';
import { emergencyLimiter } from '../middleware/rateLimit';
import { notify, rideAudience } from '../lib/notify';
import { emitToUser } from '../lib/socket';
import { getHotline, getHotlines } from '../services/systemConfig';

const router = Router();

router.get(
  '/hotlines',
  requireAuth,
  asyncHandler(async (_req, res) => {
    sendOk(res, { hotlines: await getHotlines() });
  }),
);

const createSchema = z.object({
  type: z.enum(['SOS_BUTTON', 'ROUTE_DEVIATION', 'ACCIDENT', 'VEHICLE_BREAKDOWN', 'STUDENT_UNSAFE', 'OTHER']),
  message: z.string().trim().max(500).optional(),
  rideId: z.string().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  shareLocation: z.boolean().default(true),
  contactGuardian: z.boolean().default(true),
});

router.post(
  '/',
  requireAuth,
  emergencyLimiter,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof createSchema>;

    const emergency = await getHotline('hotline.emergency');
    const dispatch = await getHotline('hotline.dispatch');

    let ride = null;
    if (body.rideId) {
      ride = await prisma.ride.findUnique({
        where: { id: body.rideId },
        include: {
          student: { include: { user: true } },
          parent: { include: { user: true } },
          driver: { include: { user: true } },
        },
      });
      if (!ride) throw notFound('Ride not found.');
      const participant =
        ride.student.userId === current.userId ||
        ride.driver?.userId === current.userId ||
        ride.parent?.userId === current.userId ||
        current.role === 'ADMIN';
      if (!participant) throw notFound('Ride not found.');
    }

    let guardianContact: string | null = null;
    if (body.contactGuardian && ride) {
      const guardians = await prisma.guardianConnection.findMany({
        where: { studentId: ride.studentId, status: 'ACTIVE' },
        include: { guardian: { select: { phone: true, firstName: true, lastName: true } } },
        take: 3,
      });
      const numbers = guardians.map((entry) => entry.guardian.phone);
      if (ride.parent) numbers.push(ride.parent.user.phone);
      guardianContact = [...new Set(numbers)].join(', ') || null;
    }

    const event = await prisma.emergencyEvent.create({
      data: {
        raisedById: current.userId,
        driverId: ride?.driverId ?? null,
        rideId: ride?.id ?? null,
        type: body.type as EmergencyType,
        message: body.message ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        hotlineNumber: emergency?.number ?? dispatch?.number ?? null,
        hotlineLabel: emergency?.label ?? dispatch?.label ?? null,
        guardianContact,
        sharedWithGuardian: Boolean(body.shareLocation && body.lat != null),
      },
    });

    if (ride) {
      await prisma.rideEvent
        .create({
          data: {
            rideId: ride.id,
            type: 'SOS_TRIGGERED',
            message: `Emergency alert raised: ${body.type.replace(/_/g, ' ').toLowerCase()}.`,
            meta: { emergencyId: event.id },
            actorId: current.userId,
          },
        })
        .catch(() => undefined);
    }

    // Alert the safety desk (admin accounts) and everyone on the ride.
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        type: 'EMERGENCY',
        title: 'SOS alert',
        body: `${current.user.fullName} raised an emergency${ride ? ` on ride ${ride.code}` : ''}.`,
        data: { emergencyId: event.id, rideId: ride?.id ?? null },
        rideId: ride?.id ?? undefined,
      });
    }

    if (ride) {
      const audience = await rideAudience(ride.id);
      for (const userId of audience) {
        emitToUser(userId, 'emergency:raised', {
          id: event.id,
          rideId: ride.id,
          type: event.type,
          hotline: emergency?.number ?? dispatch?.number ?? null,
          createdAt: event.createdAt,
        });
      }
    }

    sendCreated(res, {
      emergency: event,
      hotline: emergency ?? dispatch,
      guardianContact,
      message:
        'Your alert has been logged and shared with the safety desk together with your live location.',
    });
  }),
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const mine = req.query.mine === 'true';

    const where: Record<string, unknown> = {};
    if (mine || current.role !== 'ADMIN') {
      if (current.role === 'DRIVER') {
        const driver = await prisma.driverProfile.findUnique({ where: { userId: current.userId } });
        where.driverId = driver?.id ?? '__none__';
      } else {
        where.raisedById = current.userId;
      }
    }
    if (typeof req.query.status === 'string' && req.query.status !== 'ALL') {
      where.status = req.query.status;
    }

    const emergencies = await prisma.emergencyEvent.findMany({
      where,
      include: {
        raisedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        ride: { select: { id: true, code: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    sendOk(res, { emergencies });
  }),
);

router.post(
  '/:id/acknowledge',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const event = await prisma.emergencyEvent.findUnique({ where: { id: req.params.id } });
    if (!event) throw notFound('Emergency not found.');
    if (event.status !== 'ACTIVE') throw badRequest('That alert has already been handled.');

    const updated = await prisma.emergencyEvent.update({
      where: { id: event.id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedById: current.userId,
        acknowledgedAt: new Date(),
      },
    });

    await notify({
      userId: event.raisedById,
      type: 'EMERGENCY',
      title: 'Help is on the way',
      body: 'The safety desk received your alert and is responding now.',
      data: { emergencyId: event.id },
    });

    sendOk(res, { emergency: updated });
  }),
);

const resolveSchema = z.object({
  status: z.enum(['RESOLVED', 'FALSE_ALARM']),
  note: z.string().trim().min(3, 'Add a short resolution note.').max(500),
});

router.post(
  '/:id/resolve',
  requireRole('ADMIN'),
  validateBody(resolveSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof resolveSchema>;
    const event = await prisma.emergencyEvent.findUnique({ where: { id: req.params.id } });
    if (!event) throw notFound('Emergency not found.');

    const updated = await prisma.emergencyEvent.update({
      where: { id: event.id },
      data: {
        status: body.status,
        resolutionNote: body.note,
        acknowledgedById: event.acknowledgedById ?? current.userId,
        resolvedAt: new Date(),
      },
    });

    await notify({
      userId: event.raisedById,
      type: 'EMERGENCY',
      title: body.status === 'RESOLVED' ? 'Emergency resolved' : 'Alert closed',
      body: body.note,
      data: { emergencyId: event.id },
    });

    sendOk(res, { emergency: updated });
  }),
);

export default router;
