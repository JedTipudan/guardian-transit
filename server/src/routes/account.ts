import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, validateBody } from '../lib/errors';
import { hashPassword, passwordIssues, verifyPassword } from '../lib/password';
import { requireAuth, authed } from '../middleware/auth';
import { sendOk } from '../lib/http';
import { toSafeUser } from '../types';

const router = Router();
router.use(requireAuth);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const user = await prisma.user.findUnique({
      where: { id: current.userId },
      include: {
        studentProfile: true,
        parentProfile: true,
        driverProfile: { include: { vehicles: true, verifications: true } },
      },
    });
    if (!user) {
      res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Please sign in to continue.' },
      });
      return;
    }
    sendOk(res, { user: toSafeUser(user) });
  }),
);

const updateSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .optional()
    .nullable(),
  avatarUrl: z.string().url().max(400).optional().nullable(),
  school: z.string().trim().min(2).max(120).optional(),
  grade: z.string().trim().min(1).max(40).optional(),
  homeAddress: z.string().trim().min(4).max(200).optional(),
  address: z.string().trim().max(200).optional().nullable(),
  preferredContact: z.enum(['PHONE', 'EMAIL', 'SMS']).optional(),
});

router.patch(
  '/me',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const body = req.body as z.infer<typeof updateSchema>;

    if (body.email) {
      const clash = await prisma.user.findFirst({
        where: { email: body.email, NOT: { id: current.userId } },
      });
      if (clash) throw badRequest('That email address is already in use.');
    }

    const user = await prisma.user.update({
      where: { id: current.userId },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email === undefined ? undefined : body.email || null,
        avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl || null,
        studentProfile:
          current.user.role === 'STUDENT' &&
          (body.school || body.grade || body.homeAddress)
            ? {
                update: {
                  school: body.school,
                  grade: body.grade,
                  homeAddress: body.homeAddress,
                },
              }
            : undefined,
        parentProfile:
          current.user.role === 'PARENT' && (body.address !== undefined || body.preferredContact)
            ? {
                update: {
                  address: body.address === undefined ? undefined : body.address || null,
                  preferredContact: body.preferredContact,
                },
              }
            : undefined,
      },
      include: {
        studentProfile: true,
        parentProfile: true,
        driverProfile: { include: { vehicles: true, verifications: true } },
      },
    });

    sendOk(res, { user: toSafeUser(user) });
  }),
);

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(1, 'Enter a new password.'),
});

router.post(
  '/password',
  validateBody(passwordChangeSchema),
  asyncHandler(async (req, res) => {
    const current = authed(req);
    const { currentPassword, newPassword } = req.body as z.infer<typeof passwordChangeSchema>;

    const issues = passwordIssues(newPassword);
    if (issues.length) throw badRequest(issues[0]);

    const user = await prisma.user.findUnique({ where: { id: current.userId } });
    if (!user) throw badRequest('Please sign in again.');

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw badRequest('Your current password is incorrect.');

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    sendOk(res, { changed: true });
  }),
);

export default router;
