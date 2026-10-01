import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler, notFound } from '../lib/errors';
import { authed, requireAuth } from '../middleware/auth';
import { sendOk } from '../lib/http';
import { ACTIVE_RIDE_STATUSES } from '../services/rides';

const router = Router();
router.use(requireAuth);

/** Students the signed-in user is allowed to book or monitor. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const current = authed(req);

    if (current.role === 'STUDENT') {
      const student = await prisma.studentProfile.findUnique({
        where: { userId: current.userId },
        include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      });
      sendOk(res, {
        students: student
          ? [await shape(student.id, student.user, student.studentCode, student.school, student.grade)]
          : [],
      });
      return;
    }

    if (current.role === 'ADMIN') {
      const students = await prisma.studentProfile.findMany({
        include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        take: 100,
      });
      sendOk(res, {
        students: await Promise.all(
          students.map((student) =>
            shape(student.id, student.user, student.studentCode, student.school, student.grade),
          ),
        ),
      });
      return;
    }

    const connections = await prisma.guardianConnection.findMany({
      where: { guardianUserId: current.userId, status: 'ACTIVE' },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        },
      },
    });

    sendOk(res, {
      students: await Promise.all(
        connections.map((connection) =>
          shape(
            connection.student.id,
            connection.student.user,
            connection.student.studentCode,
            connection.student.school,
            connection.student.grade,
            connection.id,
          ),
        ),
      ),
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const student = await prisma.studentProfile.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (!student) throw notFound('Student not found.');

    if (current.role === 'STUDENT' && student.userId !== current.userId) {
      throw notFound('Student not found.');
    }
    if (current.role === 'PARENT') {
      const connection = await prisma.guardianConnection.findFirst({
        where: { guardianUserId: current.userId, studentId: student.id, status: 'ACTIVE' },
      });
      if (!connection) throw notFound('Student not found.');
    }

    sendOk(res, {
      student: await shape(
        student.id,
        student.user,
        student.studentCode,
        student.school,
        student.grade,
      ),
    });
  }),
);

async function shape(
  id: string,
  user: { firstName: string; lastName: string; avatarUrl: string | null },
  studentCode: string,
  school: string,
  grade: string,
  connectionId?: string,
) {
  const [activeRide, balance] = await Promise.all([
    prisma.ride.findFirst({
      where: { studentId: id, status: { in: ACTIVE_RIDE_STATUSES } },
      select: { id: true, code: true, status: true },
    }),
    prisma.guardianPoint.findFirst({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    }),
  ]);

  return {
    id,
    connectionId: connectionId ?? null,
    name: `${user.firstName} ${user.lastName}`,
    avatarUrl: user.avatarUrl,
    studentCode,
    school,
    grade,
    activeRide,
    points: balance?.balanceAfter ?? 0,
  };
}

export default router;
