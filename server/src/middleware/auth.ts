import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';
import { ACCESS_COOKIE, verifyAccessToken } from '../lib/tokens';
import { toSafeUser, type SafeUser } from '../types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; role: UserRole };
      user?: SafeUser;
    }
  }
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  return cookies?.[ACCESS_COOKIE];
}

/** Resolves the current session if a valid token is present; never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) return next();
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        studentProfile: true,
        parentProfile: true,
        driverProfile: { include: { vehicles: true, verifications: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') return next();
    req.auth = { userId: user.id, sessionId: payload.sid, role: user.role };
    req.user = toSafeUser(user);
    next();
  } catch {
    next();
  }
}

/** Requires a valid access token and an active account. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) throw unauthorized('Please sign in to continue.');

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        studentProfile: true,
        parentProfile: true,
        driverProfile: { include: { vehicles: true, verifications: true } },
      },
    });

    if (!user) throw unauthorized('Please sign in to continue.');
    if (user.status === 'SUSPENDED') {
      throw forbidden('This account is suspended. Contact your administrator.');
    }
    if (user.status === 'DEACTIVATED') {
      throw unauthorized('This account has been deactivated.');
    }

    req.auth = { userId: user.id, sessionId: payload.sid, role: user.role };
    req.user = toSafeUser(user);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized('Please sign in to continue.'));
    if (!roles.includes(req.auth.role)) {
      return next(forbidden('Your account does not have access to this action.'));
    }
    next();
  };
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: UserRole;
  user: SafeUser;
}

/** Narrow helper for handlers that run after `requireAuth`. */
export function authed(req: Request): AuthContext {
  if (!req.auth || !req.user) throw unauthorized('Please sign in to continue.');
  return { ...req.auth, user: req.user };
}
