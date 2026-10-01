import { Router } from 'express';
import { z } from 'zod';
import type { SafetyReportCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, notFound, validateBody } from '../lib/errors';
import { authed, requireAuth, requireRole } from '../middleware/auth';
import { sendOk, sendCreated } from '../lib/http';
import { notify } from '../lib/notify';

const router = Router();

export const SAFETY_CATEGORIES: Array<{ value: SafetyReportCategory; label: string; hint: string }> = [
  { value: 'DRIVER_BEHAVIOR', label: 'Driver behaviour', hint: 'Rudeness, phone use, unsafe conduct' },
  { value: 'VEHICLE_CONDITION', label: 'Vehicle condition', hint: 'Lights, tyres, cleanliness, capacity' },
  { value: 'ROUTE_DEVIATION', label: 'Route deviation', hint: 'Stops or detours that were not planned' },
  { value: 'UNEXPECTED_DELAY', label: 'Unexpected delay', hint: 'Late pickup or drop-off' },
  { value: 'PICKUP_OR_DROPOFF_ISSUE', label: 'Pickup or drop-off issue', hint: 'Wrong gate, wrong address' },
  { value: 'HARSH_DRIVING', label: 'Harsh driving', hint: 'Speeding, hard braking, sharp turns' },
  { value: 'OTHER', label: 'Something else', hint: 'Anything not listed above' },
];

router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (_req, res) => {
    sendOk(res, { categories: SAFETY_CATEGORIES });
  }),
);

const createSchema = z.object({
  category: z.enum([
    'DRIVER_BEHAVIOR',
    'VEHICLE_CONDITION',
    'ROUTE_DEVIATION',
    'UNEXPECTED_DELAY',
    'PICKUP_OR_DROPOFF_ISSUE',
    'HARSH_DRIVING',
    'OTHER',
  ]),
  subject: z.string().trim().min(4, 'Add a short title.').max(120),
  description: z.string().trim().min(10, 'Describe what happened (at least 10 characters).').max(1500),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  rideId: z.string().optional().nullable(),
});

router.post(
  '/',
  requireAuth,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof createSchema>;

    let rideId: string | null = null;
    if (body.rideId) {
      const ride = await prisma.ride.findUnique({
        where: { id: body.rideId },
        include: { student: true, driver: { include: { user: true } }, parent: true },
      });
      if (!ride) throw notFound('Ride not found.');
      const participant =
        ride.student.userId === current.userId ||
        ride.driver.user.id === current.userId ||
        ride.parent?.userId === current.userId ||
        current.role === 'ADMIN';
      if (!participant) throw notFound('Ride not found.');
      rideId = ride.id;

      await prisma.notification.create({
        data: {
          userId: ride.driver.user.id,
          type: 'SAFETY_REPORT',
          title: 'A safety report was filed about this trip',
          body: 'The safety desk will review it. You can add context from your trip history.',
          data: { rideId },
          rideId,
        },
      });
    }

    const report = await prisma.safetyReport.create({
      data: {
        reporterId: current.userId,
        rideId,
        category: body.category,
        subject: body.subject,
        description: body.description,
        severity: body.severity,
        status: 'NEW',
      },
    });

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        type: 'SAFETY_REPORT',
        title: 'New safety report',
        body: body.subject,
        data: { reportId: report.id },
      });
    }

    sendCreated(res, {
      report: {
        id: report.id,
        category: report.category,
        subject: report.subject,
        status: report.status,
        createdAt: report.createdAt,
      },
      message: 'Thanks — your report is with the safety desk and will be reviewed.',
    });
  }),
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const reports = await prisma.safetyReport.findMany({
      where: { reporterId: current.userId },
      include: { ride: { select: { id: true, code: true, requestedAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    sendOk(res, { reports });
  }),
);

router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status !== 'ALL') {
      where.status = req.query.status;
    }
    if (typeof req.query.category === 'string' && req.query.category !== 'ALL') {
      where.category = req.query.category;
    }

    const reports = await prisma.safetyReport.findMany({
      where,
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, role: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        ride: { select: { id: true, code: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    sendOk(res, { reports });
  }),
);

const updateSchema = z.object({
  status: z.enum(['NEW', 'UNDER_REVIEW', 'RESOLVED']).optional(),
  resolution: z.string().trim().max(1000).optional(),
});

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof updateSchema>;
    const report = await prisma.safetyReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw notFound('Report not found.');
    if (body.status === 'RESOLVED' && !body.resolution && !report.resolution) {
      throw badRequest('Add a resolution note before marking this resolved.');
    }

    const updated = await prisma.safetyReport.update({
      where: { id: report.id },
      data: {
        status: body.status,
        resolution: body.resolution,
        assignedToId: body.status && body.status !== 'NEW' ? current.userId : report.assignedToId,
        resolvedAt: body.status === 'RESOLVED' ? new Date() : report.resolvedAt,
      },
    });

    await notify({
      userId: report.reporterId,
      type: 'SAFETY_REPORT',
      title:
        updated.status === 'RESOLVED'
          ? 'Your safety report was resolved'
          : updated.status === 'UNDER_REVIEW'
            ? 'Your safety report is under review'
            : 'Your safety report was received',
      body: updated.resolution ?? updated.subject,
      data: { reportId: updated.id },
    });

    sendOk(res, { report: updated });
  }),
);

export default router;
