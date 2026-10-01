import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler, notFound } from '../lib/errors';
import { authed, requireAuth } from '../middleware/auth';
import { sendOk } from '../lib/http';
import config from '../config/env';
import { getPublicConfig } from '../services/systemConfig';
import { toSafeUser } from '../types';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database: 'up' | 'down' = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      ok: database === 'up',
      data: {
        status: database === 'up' ? 'ok' : 'degraded',
        database,
        uptimeSeconds: Math.round(process.uptime()),
        time: new Date().toISOString(),
      },
    });
  }),
);

/** Public runtime configuration: map provider (never the key) and safety numbers. */
router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const publicConfig = await getPublicConfig();
    sendOk(res, {
      maps: {
        provider: config.map.provider,
        tileUrl: config.map.tileUrl,
        attribution: config.map.attribution,
        hasApiKey: Boolean(config.map.apiKey),
      },
      otp: {
        ttlSeconds: config.otp.ttlSeconds,
        length: config.otp.length,
        maxAttempts: config.otp.maxAttempts,
        resendCooldownSeconds: config.otp.resendCooldownSeconds,
      },
      smsProvider: config.sms.provider,
      ...publicConfig,
    });
  }),
);

router.get(
  '/session',
  requireAuth,
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
    if (!user) throw notFound('Account not found.');
    sendOk(res, { user: toSafeUser(user) });
  }),
);

export default router;
