import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, conflict, notFound, validateBody } from '../lib/errors';
import { requireRole, authed } from '../middleware/auth';
import { sendOk, sendCreated } from '../lib/http';
import { notify } from '../lib/notify';

const router = Router();

function includeStudent() {
  return {
    student: {
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
      },
    },
    guardian: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        avatarUrl: true,
      },
    },
  } as const;
}

/** Connections where the signed-in user is the guardian. */
router.get(
  '/connections',
  requireRole('PARENT', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const connections = await prisma.guardianConnection.findMany({
      where: { guardianUserId: current.userId },
      include: includeStudent(),
      orderBy: { createdAt: 'desc' },
    });

    const shaped = await Promise.all(
      connections.map(async (connection) => {
        const [balance, activeRide, completedRides] = await Promise.all([
          prisma.guardianPoint.findFirst({
            where: { studentId: connection.studentId },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.ride.findFirst({
            where: {
              studentId: connection.studentId,
              status: { in: ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PIN_VERIFIED', 'IN_PROGRESS'] },
            },
            include: {
              driver: { include: { user: { select: { firstName: true, lastName: true } } } },
              vehicle: true,
            },
          }),
          prisma.ride.count({ where: { studentId: connection.studentId, status: 'COMPLETED' } }),
        ]);

        return {
          id: connection.id,
          status: connection.status,
          createdAt: connection.createdAt,
          note: connection.note,
          student: {
            id: connection.student.id,
            studentCode: connection.student.studentCode,
            name: `${connection.student.user.firstName} ${connection.student.user.lastName}`,
            avatarUrl: connection.student.user.avatarUrl,
            school: connection.student.school,
            grade: connection.student.grade,
          },
          points: balance?.balanceAfter ?? 0,
          completedRides,
          activeRide,
        };
      }),
    );

    sendOk(res, { connections: shaped });
  }),
);

/** Pending requests needing a decision. */
router.get(
  '/requests',
  requireRole('PARENT', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const requests = await prisma.guardianConnection.findMany({
      where: {
        guardianUserId: current.userId,
        status: { in: ['PENDING', 'DECLINED'] },
      },
      include: includeStudent(),
      orderBy: { createdAt: 'desc' },
    });

    sendOk(res, {
      requests: requests.map((connection) => ({
        id: connection.id,
        status: connection.status,
        createdAt: connection.createdAt,
        requestedBy: connection.requestedById === current.userId ? 'me' : 'student',
        student: {
          id: connection.student.id,
          studentCode: connection.student.studentCode,
          name: `${connection.student.user.firstName} ${connection.student.user.lastName}`,
          school: connection.student.school,
          grade: connection.student.grade,
          avatarUrl: connection.student.user.avatarUrl,
        },
      })),
    });
  }),
);

/** Guardians linked to the signed-in student. */
router.get(
  '/students/:studentId/guardians',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const { studentId } = req.params;

    const profile = await prisma.studentProfile.findUnique({ where: { id: studentId } });
    if (!profile) throw notFound('Student not found.');

    if (
      current.role === 'STUDENT' &&
      (await prisma.studentProfile.findFirst({ where: { id: studentId, userId: current.userId } })) ===
        null
    ) {
      throw notFound('Student not found.');
    }

    const connections = await prisma.guardianConnection.findMany({
      where: { studentId, status: 'ACTIVE' },
      include: includeStudent(),
    });

    sendOk(res, {
      guardians: connections.map((connection) => ({
        id: connection.id,
        name: `${connection.guardian.firstName} ${connection.guardian.lastName}`,
        phone: connection.guardian.phone,
        email: connection.guardian.email,
        avatarUrl: connection.guardian.avatarUrl,
        since: connection.respondedAt ?? connection.createdAt,
      })),
    });
  }),
);

const requestSchema = z
  .object({
    studentCode: z.string().trim().min(4, 'Enter the student code.').max(40),
    note: z.string().trim().max(200).optional(),
  })
  .transform((value) => ({ ...value, studentCode: value.studentCode.toUpperCase() }));

router.post(
  '/connections',
  requireRole('PARENT', 'ADMIN'),
  validateBody(requestSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const { studentCode, note } = req.body as z.infer<typeof requestSchema>;

    const student = await prisma.studentProfile.findUnique({
      where: { studentCode },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!student) {
      throw notFound('No student found with that code. Ask the guardian to double-check it.');
    }

    const existing = await prisma.guardianConnection.findUnique({
      where: {
        guardianUserId_studentId: {
          guardianUserId: current.userId,
          studentId: student.id,
        },
      },
    });

    if (existing) {
      if (existing.status === 'ACTIVE') throw conflict('You are already linked to this student.');
      if (existing.status === 'PENDING') throw conflict('A request is already pending for this student.');
      if (existing.status === 'DECLINED') {
        throw conflict('The previous request was declined. Contact the student to re-issue it.');
      }
      await prisma.guardianConnection.update({
        where: { id: existing.id },
        data: { status: 'PENDING', revokedAt: null, createdAt: new Date() },
      });
      sendCreated(res, { id: existing.id, status: 'PENDING' });
      return;
    }

    const connection = await prisma.guardianConnection.create({
      data: {
        guardianUserId: current.userId,
        studentId: student.id,
        requestedById: current.userId,
        note: note ?? null,
        status: 'PENDING',
      },
    });

    await notify({
      userId: student.userId,
      type: 'GUARDIAN_REQUEST',
      title: 'Guardian link request',
      body: `${current.user.fullName} would like to follow your trips.`,
      data: { connectionId: connection.id },
    });

    sendCreated(res, { id: connection.id, status: connection.status });
  }),
);

router.post(
  '/connections/:id/accept',
  requireRole('STUDENT', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const connection = await prisma.guardianConnection.findUnique({
      where: { id: req.params.id },
      include: { student: true },
    });
    if (!connection) throw notFound('Request not found.');
    if (current.role === 'STUDENT' && connection.student.userId !== current.userId) {
      throw notFound('Request not found.');
    }
    if (connection.status !== 'PENDING') {
      throw badRequest('That request has already been answered.');
    }

    const updated = await prisma.guardianConnection.update({
      where: { id: connection.id },
      data: { status: 'ACTIVE', respondedAt: new Date() },
    });

    await notify({
      userId: connection.guardianUserId,
      type: 'GUARDIAN_CONNECTED',
      title: 'Guardian access granted',
      body: 'You can now follow this student’s rides in real time.',
      data: { connectionId: connection.id },
    });

    sendOk(res, { connection: updated });
  }),
);

router.post(
  '/connections/:id/decline',
  requireRole('STUDENT', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const connection = await prisma.guardianConnection.findUnique({
      where: { id: req.params.id },
      include: { student: true },
    });
    if (!connection) throw notFound('Request not found.');
    if (current.role === 'STUDENT' && connection.student.userId !== current.userId) {
      throw notFound('Request not found.');
    }
    if (connection.status !== 'PENDING') throw badRequest('That request has already been answered.');

    const updated = await prisma.guardianConnection.update({
      where: { id: connection.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });

    sendOk(res, { connection: updated });
  }),
);

router.post(
  '/connections/:id/revoke',
  requireRole('PARENT', 'STUDENT', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const connection = await prisma.guardianConnection.findUnique({
      where: { id: req.params.id },
      include: { student: true },
    });
    if (!connection) throw notFound('Connection not found.');

    const isGuardian = connection.guardianUserId === current.userId;
    const isStudent = connection.student.userId === current.userId;
    if (!isGuardian && !isStudent && current.role !== 'ADMIN') {
      throw notFound('Connection not found.');
    }

    const updated = await prisma.guardianConnection.update({
      where: { id: connection.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    sendOk(res, { connection: updated });
  }),
);

export default router;
