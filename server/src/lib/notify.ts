import type { NotificationType } from '@prisma/client';
import { prisma } from './prisma';
import { emitToUser } from './socket';

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  rideId?: string;
}

/** Persists an in-app notification and pushes it to any live sockets for that user. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? undefined) as never,
        rideId: input.rideId,
      },
    });

    emitToUser(input.userId, 'notification:new', notification);
  } catch (error) {
    console.error('[notify] failed to create notification', error);
  }
}

export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  await Promise.all(unique.map((userId) => notify({ ...input, userId })));
}

/** User ids that should receive live updates about a ride: student, parent, driver and active guardians. */
export async function rideAudience(rideId: string): Promise<string[]> {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      studentId: true,
      parent: { select: { userId: true } },
      driver: { select: { userId: true } },
    },
  });
  if (!ride) return [];

  const guardians = await prisma.guardianConnection.findMany({
    where: { studentId: ride.studentId, status: 'ACTIVE' },
    select: { guardian: { select: { id: true } } },
  });

  const student = await prisma.studentProfile.findUnique({
    where: { id: ride.studentId },
    select: { userId: true },
  });

  const ids: string[] = [];
  if (student) ids.push(student.userId);
  if (ride.parent) ids.push(ride.parent.userId);
  if (ride.driver) ids.push(ride.driver.userId);
  for (const connection of guardians) ids.push(connection.guardian.id);
  return [...new Set(ids)];
}
