import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import config from '../config/env';
import { prisma } from './prisma';
import { ACCESS_COOKIE, verifyAccessToken } from './tokens';
import { toSafeUser } from '../types';

let io: Server | null = null;

export function getIO(): Server | null {
  return io;
}

/** Emits to every live connection owned by a user (a guardian may have two tabs). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds: string[], event: string, payload: unknown): void {
  for (const id of new Set(userIds)) emitToUser(id, event, payload);
}

/** Broadcasts raw trip telemetry to everyone watching a specific ride. */
export function emitToRide(rideId: string, event: string, payload: unknown): void {
  io?.to(`ride:${rideId}`).emit(event, payload);
}

interface CookieBag {
  [key: string]: string | undefined;
}

function parseCookies(header?: string): CookieBag {
  if (!header) return {};
  const out: CookieBag = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function createSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    serveClient: false,
  });

  io.use(async (socket: Socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies[ACCESS_COOKIE] ?? (socket.handshake.auth?.token as string | undefined);
      if (!token) return next(new Error('unauthorized'));

      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          studentProfile: true,
          parentProfile: true,
          driverProfile: { include: { vehicles: true, verifications: true } },
        },
      });
      if (!user || user.status !== 'ACTIVE') return next(new Error('unauthorized'));

      socket.data.userId = user.id;
      socket.data.role = user.role;
      socket.data.user = toSafeUser(user);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on('ride:watch', (rideId: unknown) => {
      if (typeof rideId === 'string' && rideId.length > 0 && rideId.length < 64) {
        socket.join(`ride:${rideId}`);
      }
    });

    socket.on('ride:unwatch', (rideId: unknown) => {
      if (typeof rideId === 'string') socket.leave(`ride:${rideId}`);
    });

    socket.on('driver:location', (payload: unknown) => {
      if (socket.data.role !== 'DRIVER') return;
      void handleDriverLocation(userId, payload);
    });

    socket.on('disconnect', () => {
      /* rooms are cleaned up automatically */
    });
  });

  return io;
}

interface DriverLocationPayload {
  rideId?: string;
  lat: number;
  lng: number;
  speedKph?: number;
  heading?: number;
  accuracyM?: number;
}

/** Persists and broadcasts live driver telemetry. Validation is strict: bad frames are dropped. */
async function handleDriverLocation(userId: string, payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') return;
  const frame = payload as DriverLocationPayload;
  if (typeof frame.lat !== 'number' || typeof frame.lng !== 'number') return;
  if (!Number.isFinite(frame.lat) || !Number.isFinite(frame.lng)) return;
  if (frame.lat < -90 || frame.lat > 90 || frame.lng < -180 || frame.lng > 180) return;

  try {
    const driver = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!driver) return;

    await prisma.driverProfile.update({
      where: { id: driver.id },
      data: { lat: frame.lat, lng: frame.lng, lastLocationAt: new Date() },
    });

    if (!frame.rideId) return;

    const ride = await prisma.ride.findFirst({
      where: {
        id: frame.rideId,
        driverId: driver.id,
        status: { in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PIN_VERIFIED', 'IN_PROGRESS'] },
      },
      include: { student: true, parent: true },
    });
    if (!ride) return;

    await prisma.rideLocation.create({
      data: {
        rideId: ride.id,
        lat: frame.lat,
        lng: frame.lng,
        speedKph: typeof frame.speedKph === 'number' ? frame.speedKph : null,
        heading: typeof frame.heading === 'number' ? frame.heading : null,
        accuracyM: typeof frame.accuracyM === 'number' ? frame.accuracyM : null,
      },
    });

    emitToRide(ride.id, 'trip:location', {
      rideId: ride.id,
      lat: frame.lat,
      lng: frame.lng,
      speedKph: frame.speedKph ?? null,
      heading: frame.heading ?? null,
      accuracyM: frame.accuracyM ?? null,
      recordedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[socket] driver location error', error);
  }
}
