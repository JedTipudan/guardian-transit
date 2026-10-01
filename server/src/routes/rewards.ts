import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler, notFound } from '../lib/errors';
import { authed, requireAuth } from '../middleware/auth';
import { sendOk } from '../lib/http';
import {
  POINTS_FOR_FREE_RIDE,
  POINTS_PER_RIDE,
  getLedger,
  getRewards,
} from '../lib/points';

const router = Router();
router.use(requireAuth);

/** Resolves the student whose rewards are being viewed, enforcing access rules. */
async function resolveStudent(viewer: { userId: string; role: string }, requestedId?: string) {
  if (viewer.role === 'STUDENT') {
    const student = await prisma.studentProfile.findUnique({
      where: { userId: viewer.userId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw notFound('Student profile not found.');
    return student;
  }

  if (!requestedId) throw notFound('Choose a student to view their points.');
  const student = await prisma.studentProfile.findUnique({
    where: { id: requestedId },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  if (!student) throw notFound('Student not found.');

  if (viewer.role === 'ADMIN') return student;

  const connection = await prisma.guardianConnection.findFirst({
    where: { guardianUserId: viewer.userId, studentId: student.id, status: 'ACTIVE' },
  });
  if (!connection) throw notFound('Student not found.');
  return student;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const requestedId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const student = await resolveStudent(current, requestedId);

    const [ledger, rewards, completedRides, redemptionCount] = await Promise.all([
      getLedger(student.id, 60),
      getRewards(student.id),
      prisma.ride.count({ where: { studentId: student.id, status: 'COMPLETED' } }),
      prisma.reward.count({ where: { studentId: student.id, status: 'REDEEMED' } }),
    ]);

    const balance = ledger[0]?.balanceAfter ?? 0;
    const progress = balance % POINTS_FOR_FREE_RIDE;
    const freeRidesAvailable = rewards.filter((reward) => reward.status === 'ISSUED').length;

    sendOk(res, {
      student: {
        id: student.id,
        studentCode: student.studentCode,
        name: `${student.user.firstName} ${student.user.lastName}`,
      },
      balance,
      perRide: POINTS_PER_RIDE,
      goal: POINTS_FOR_FREE_RIDE,
      progress,
      remaining: POINTS_FOR_FREE_RIDE - progress,
      percent: Math.round((progress / POINTS_FOR_FREE_RIDE) * 100),
      completedRides,
      freeRidesClaimed: redemptionCount,
      freeRidesAvailable,
      rewards,
      ledger,
    });
  }),
);

router.get(
  '/rewards',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const requestedId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const student = await resolveStudent(current, requestedId);
    sendOk(res, { rewards: await getRewards(student.id) });
  }),
);

export default router;
