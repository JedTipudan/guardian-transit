import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import config from '../config/env';
import { prisma } from './prisma';
import { unauthorized } from './errors';

export const ACCESS_COOKIE = 'gt_access';
export const REFRESH_COOKIE = 'gt_refresh';

export interface AccessPayload {
  sub: string;
  sid: string;
  role: string;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.authSecret, {
    expiresIn: config.accessTokenTtl as jwt.SignOptions['expiresIn'],
    issuer: 'guardian-transit',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    return jwt.verify(token, config.authSecret, { issuer: 'guardian-transit' }) as AccessPayload;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Creates a DB-backed session and returns a signed access token + opaque refresh token. */
export async function createSession(
  userId: string,
  role: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<SessionTokens> {
  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip ?? null,
      expiresAt: refreshExpiresAt,
    },
  });

  return {
    accessToken: signAccessToken({ sub: userId, sid: session.id, role }),
    refreshToken,
    refreshExpiresAt,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.authSession
    .updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.authSession
    .updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

/** Looks up a live session by its refresh token. Returns null when invalid/expired. */
export async function findSessionByRefreshToken(refreshToken: string) {
  const tokenHash = sha256(refreshToken);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  return session;
}

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.isProd,
};

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  refreshExpiresAt: Date,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookie,
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie,
    path: '/api/auth',
    expires: refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: '/api/auth' });
}

/** Slides the refresh window forward when a session is over half way through its life. */
export async function maybeRotateSession(sessionId: string, currentExpiry: Date): Promise<void> {
  const halfLife = config.refreshTokenTtlDays * 12 * 60 * 60 * 1000;
  if (currentExpiry.getTime() - Date.now() < halfLife) {
    await prisma.authSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000) },
    });
  }
}
