import { Router, type Request } from 'express';
import { z } from 'zod';
import type { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  asyncHandler,
  badRequest,
  conflict,
  notFound,
  unauthorized,
  validateBody,
} from '../lib/errors';
import { hashPassword, passwordIssues, verifyPassword } from '../lib/password';
import { issueOtp, normalizePhone, otpRetryMessage, verifyOtp } from '../lib/otp';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  createSession,
  findSessionByRefreshToken,
  maybeRotateSession,
  revokeAllSessions,
  revokeSession,
  setAuthCookies,
  signAccessToken,
} from '../lib/tokens';
import { authLimiter, otpLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';
import { sendOk, sendCreated } from '../lib/http';
import { toSafeUser } from '../types';

const router = Router();

const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid mobile number.')
  .max(20, 'Enter a valid mobile number.')
  .transform(normalizePhone);

const passwordSchema = z
  .string()
  .min(1, 'Enter your password.')
  .max(128, 'Password is too long.');

function sessionMeta(req: Request) {
  return {
    userAgent: String(req.headers['user-agent'] ?? ''),
    ip: req.ip ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const registerSchema = z
  .object({
    role: z.enum(['STUDENT', 'PARENT', 'DRIVER']),
    firstName: z.string().trim().min(2, 'Enter your first name.').max(60),
    lastName: z.string().trim().min(2, 'Enter your last name.').max(60),
    phone: phoneSchema,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address.')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    password: passwordSchema,
    // Student fields
    school: z.string().trim().min(2).max(120).optional(),
    grade: z.string().trim().min(1).max(40).optional(),
    homeAddress: z.string().trim().min(4).max(200).optional(),
    // Parent fields
    address: z.string().trim().max(200).optional(),
    // Driver fields
    licenseNumber: z.string().trim().min(4).max(60).optional(),
    licenseExpiry: z.string().optional(),
    licenseClass: z.string().trim().max(30).optional(),
    vehicle: z
      .object({
        nickname: z.string().trim().min(2).max(40),
        make: z.string().trim().min(1).max(60),
        model: z.string().trim().min(1).max(60),
        color: z.string().trim().min(1).max(40),
        plateNumber: z.string().trim().min(2).max(20),
        capacity: z.number().int().min(1).max(20).optional(),
        year: z.number().int().min(1980).max(2035).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const issues = passwordIssues(value.password);
    for (const message of issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message });
    }
    if (value.role === 'STUDENT') {
      if (!value.school) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['school'], message: 'Tell us which school you attend.' });
      if (!value.grade) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['grade'], message: 'Tell us your grade level.' });
      if (!value.homeAddress) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['homeAddress'], message: 'Enter your home address for pickups.' });
    }
    if (value.role === 'DRIVER') {
      if (!value.licenseNumber) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['licenseNumber'], message: 'Driver licence number is required.' });
      if (!value.licenseExpiry) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['licenseExpiry'], message: 'Driver licence expiry date is required.' });
      if (!value.vehicle) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicle'], message: 'Vehicle details are required.' });
    }
  });

router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof registerSchema>;

    const existingByPhone = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existingByPhone) {
      throw conflict('An account already exists for this mobile number. Try signing in instead.');
    }
    if (body.email) {
      const existingByEmail = await prisma.user.findUnique({ where: { email: body.email } });
      if (existingByEmail) {
        throw conflict('An account already exists for this email address.');
      }
    }

    const passwordHash = await hashPassword(body.password);
    const role = body.role as UserRole;

    const user = await prisma.user.create({
      data: {
        role,
        status: 'PENDING',
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        email: body.email || null,
        passwordHash,
        studentProfile:
          role === 'STUDENT'
            ? {
                create: {
                  studentCode: await nextStudentCode(),
                  school: body.school!,
                  grade: body.grade!,
                  homeAddress: body.homeAddress!,
                },
              }
            : undefined,
        parentProfile:
          role === 'PARENT' ? { create: { address: body.address ?? null } } : undefined,
        driverProfile:
          role === 'DRIVER'
            ? {
                create: {
                  licenseNumber: body.licenseNumber!,
                  licenseExpiry: new Date(body.licenseExpiry!),
                  licenseClass: body.licenseClass ?? null,
                  address: body.address ?? null,
                  vehicles: body.vehicle
                    ? {
                        create: {
                          nickname: body.vehicle.nickname,
                          make: body.vehicle.make,
                          model: body.vehicle.model,
                          color: body.vehicle.color,
                          plateNumber: body.vehicle.plateNumber.toUpperCase(),
                          capacity: body.vehicle.capacity ?? 4,
                          year: body.vehicle.year ?? null,
                          status: 'PENDING',
                        },
                      }
                    : undefined,
                  verifications: {
                    create: [
                      { docType: 'IDENTITY', status: 'PENDING' },
                      { docType: 'GOVERNMENT', status: 'PENDING' },
                      { docType: 'BACKGROUND', status: 'PENDING' },
                    ],
                  },
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

    if (role === 'DRIVER') {
      const vehicle = await prisma.vehicle.findFirst({ where: { driverId: user.driverProfile!.id } });
      if (vehicle) {
        await prisma.vehicleVerification.createMany({
          data: [
            { vehicleId: vehicle.id, docType: 'Registration', status: 'PENDING' },
            { vehicleId: vehicle.id, docType: 'Insurance', status: 'PENDING' },
            { vehicleId: vehicle.id, docType: 'Inspection', status: 'PENDING' },
          ],
          skipDuplicates: true,
        });
      }
    }

    const otp = await issueOtp(body.phone, 'REGISTRATION', { name: body.firstName });

    sendCreated(res, {
      userId: user.id,
      phone: user.phone,
      requiresOtp: true,
      expiresInSeconds: otp.expiresInSeconds,
      resendAfterSeconds: otp.resendAfterSeconds,
      nextStep: 'verify-otp',
    });
  }),
);

async function nextStudentCode(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.studentProfile.count();
  const suffix = String(count + 1).padStart(4, '0');
  return `SIA-${year}-${suffix}`;
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

const otpRequestSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['LOGIN', 'REGISTRATION', 'PHONE_CHANGE']).default('REGISTRATION'),
});

router.post(
  '/otp/request',
  otpLimiter,
  validateBody(otpRequestSchema),
  asyncHandler(async (req, res) => {
    const { phone, purpose } = req.body as z.infer<typeof otpRequestSchema>;
    const otp = await issueOtp(phone, purpose);
    sendOk(res, {
      phone: otp.phone,
      expiresInSeconds: otp.expiresInSeconds,
      resendAfterSeconds: otp.resendAfterSeconds,
    });
  }),
);

const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().min(4, 'Enter the code we sent you.').max(10),
  purpose: z.enum(['LOGIN', 'REGISTRATION', 'PHONE_CHANGE']).default('REGISTRATION'),
});

router.post(
  '/otp/verify',
  otpLimiter,
  validateBody(otpVerifySchema),
  asyncHandler(async (req, res) => {
    const { phone, code, purpose } = req.body as z.infer<typeof otpVerifySchema>;
    const result = await verifyOtp(phone, purpose, code);

    if (!result.ok) {
      throw badRequest(otpRetryMessage(result), {
        reason: result.reason,
        attemptsLeft: result.attemptsLeft,
      });
    }

    const user = await prisma.user.findUnique({
      where: { phone },
      include: {
        studentProfile: true,
        parentProfile: true,
        driverProfile: { include: { vehicles: true, verifications: true } },
      },
    });

    if (!user) throw notFound('We could not find an account for that number.');

    const activate = user.status === 'PENDING';

    const updated = activate
      ? await prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', lastLoginAt: new Date() },
          include: {
            studentProfile: true,
            parentProfile: true,
            driverProfile: { include: { vehicles: true, verifications: true } },
          },
        })
      : user;

    const session = await createSession(updated.id, updated.role, sessionMeta(req));
    setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);

    sendOk(res, { user: toSafeUser(updated), verifiedPhone: true });
  }),
);

// ---------------------------------------------------------------------------
// Login / session
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your mobile number or email.'),
  password: passwordSchema,
});

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body as z.infer<typeof loginSchema>;
    const needle = identifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ phone: normalizePhone(identifier) }, { email: needle }],
      },
      include: {
        studentProfile: true,
        parentProfile: true,
        driverProfile: { include: { vehicles: true, verifications: true } },
      },
    });

    // Constant-shape response when the account does not exist.
    if (!user) {
      throw unauthorized('Mobile number/email or password is incorrect.');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw unauthorized('Mobile number/email or password is incorrect.');

    if (user.status === 'SUSPENDED') {
      throw unauthorized('This account is suspended. Please contact your administrator.');
    }

    if (user.status === 'PENDING') {
      const otp = await issueOtp(user.phone, 'LOGIN', { name: user.firstName });
      sendOk(res, {
        requiresOtp: true,
        phone: user.phone,
        expiresInSeconds: otp.expiresInSeconds,
        resendAfterSeconds: otp.resendAfterSeconds,
        nextStep: 'verify-otp',
      });
      return;
    }

    const session = await createSession(user.id, user.role, sessionMeta(req));
    setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    sendOk(res, { user: toSafeUser(user), requiresOtp: false });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      clearAuthCookies(res);
      throw unauthorized('Your session has expired. Please sign in again.');
    }

    const session = await findSessionByRefreshToken(refreshToken);
    if (!session) {
      clearAuthCookies(res);
      throw unauthorized('Your session has expired. Please sign in again.');
    }

    await maybeRotateSession(session.id, session.expiresAt);

    const accessToken = signAccessToken({
      sub: session.userId,
      sid: session.id,
      role: session.user.role,
    });
    setAuthCookies(res, accessToken, refreshToken, session.expiresAt);

    sendOk(res, { user: toSafeUser(session.user as never) });
  }),
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeSession(req.auth!.sessionId);
    clearAuthCookies(res);
    sendOk(res, { signedOut: true });
  }),
);

const passwordResetSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().min(4).max(10),
  password: passwordSchema,
});

router.post(
  '/password/reset',
  authLimiter,
  validateBody(passwordResetSchema),
  asyncHandler(async (req, res) => {
    const { phone, code, password } = req.body as z.infer<typeof passwordResetSchema>;

    const issues = passwordIssues(password);
    if (issues.length) throw badRequest(issues[0]);

    const result = await verifyOtp(phone, 'LOGIN', code);
    if (!result.ok) throw badRequest(otpRetryMessage(result), { reason: result.reason });

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) throw notFound('We could not find an account for that number.');

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), status: 'ACTIVE' },
    });

    await revokeAllSessions(user.id);

    sendOk(res, { reset: true });
  }),
);

export default router;
