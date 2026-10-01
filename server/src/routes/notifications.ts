import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, notFound, validateBody } from '../lib/errors';
import { authed, requireAuth } from '../middleware/auth';
import { sendOk, sendCreated } from '../lib/http';
import { emitToUser } from '../lib/socket';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const limit = Math.min(Number(req.query.limit ?? 40) || 40, 100);
    const unreadOnly = req.query.unread === 'true';

    const notifications = await prisma.notification.findMany({
      where: { userId: current.userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    sendOk(res, {
      notifications: notifications.map((notification) => ({
        ...notification,
        data: (notification.data ?? undefined) as Record<string, unknown> | undefined,
      })),
    });
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const count = await prisma.notification.count({
      where: { userId: current.userId, readAt: null },
    });
    sendOk(res, { count });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const result = await prisma.notification.updateMany({
      where: { userId: current.userId, readAt: null },
      data: { readAt: new Date() },
    });
    emitToUser(current.userId, 'notification:read-all', {});
    sendOk(res, { updated: result.count });
  }),
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== current.userId) {
      throw notFound('Notification not found.');
    }
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    emitToUser(current.userId, 'notification:read', { id: updated.id });
    sendCreated(res, { notification: updated });
  }),
);

/** Tracks whether the browser granted Notification permission (never requested on load). */
const permissionSchema = z.object({
  permission: z.enum(['default', 'granted', 'denied']),
});

router.post(
  '/permission',
  validateBody(permissionSchema),
  asyncHandler(async (req, res) => {
    // Stored server-side only as an operational signal; the browser itself is
    // the source of truth for actually showing notifications.
    const current = authed(req);
    sendOk(res, { permission: req.body.permission, userId: current.userId });
  }),
);

export default router;
