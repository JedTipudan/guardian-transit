import crypto from 'crypto';
import type { Prisma, RideEventType, RideStatus, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { emitToRide, emitToUser } from '../lib/socket';
import { notify, rideAudience } from '../lib/notify';
import { awardRidePoints, claimFreeRide } from '../lib/points';
import { estimateRoute } from '../lib/geo';
import config from '../config/env';

export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'PIN_VERIFIED',
  'IN_PROGRESS',
];

export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 5;

// ---------------------------------------------------------------------------
// Fare
// ---------------------------------------------------------------------------

export function quoteFare(distanceKm: number): number {
  const raw = 35 + 11.5 * distanceKm;
  return Math.min(400, Math.max(45, Math.round(raw)));
}

// ---------------------------------------------------------------------------
// Pickup PIN
//
// The PIN is encrypted (AES-256-GCM) rather than hashed because the student
// must be able to read it back and pass it to the driver. It is only ever
// returned to the student, their guardians and admins.
// ---------------------------------------------------------------------------

const PIN_KEY = crypto
  .createHash('sha256')
  .update(`pickup-pin:${config.authSecret}`)
  .digest();

export function generatePin(): string {
  let out = '';
  while (out.length < PIN_LENGTH) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 250) out += String(byte % 10);
  }
  return out;
}

export function encryptPin(pin: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', PIN_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptPin(stored: string): string | null {
  try {
    const [ivPart, tagPart, dataPart] = stored.split('.');
    if (!ivPart || !tagPart || !dataPart) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', PIN_KEY, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Access rules
// ---------------------------------------------------------------------------

export interface RideActor {
  userId: string;
  role: string;
  studentUserId?: string;
  driverUserId?: string;
}

export function canViewRide(
  ride: {
    student: { userId: string };
    parent: { userId: string } | null;
    driver: { userId: string };
  },
  actor: RideActor,
): boolean {
  if (actor.role === 'ADMIN') return true;
  if (actor.userId === ride.driver.userId) return true;
  if (actor.userId === ride.student.userId) return true;
  if (ride.parent && actor.userId === ride.parent.userId) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export const rideInclude = {
  student: { include: { user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } } } },
  parent: { include: { user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } } } },
  driver: {
    include: {
      user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } },
      vehicles: true,
    },
  },
  vehicle: true,
  events: { orderBy: { createdAt: 'asc' as const } },
  point: true,
  rewardRedemptions: { include: { reward: true } },
  emergencies: true,
} as const;

type RideWithRelations = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

export function serializeRide(ride: RideWithRelations, extras: { pin?: string } = {}) {
  return {
    id: ride.id,
    code: ride.code,
    status: ride.status,
    student: {
      id: ride.student.id,
      studentCode: ride.student.studentCode,
      name: `${ride.student.user.firstName} ${ride.student.user.lastName}`,
      avatarUrl: ride.student.user.avatarUrl,
      phone: ride.student.user.phone,
      school: ride.student.school,
      grade: ride.student.grade,
    },
    parent: ride.parent
      ? {
          id: ride.parent.id,
          name: `${ride.parent.user.firstName} ${ride.parent.user.lastName}`,
          phone: ride.parent.user.phone,
        }
      : null,
    driver: {
      id: ride.driver.id,
      name: `${ride.driver.user.firstName} ${ride.driver.user.lastName}`,
      avatarUrl: ride.driver.user.avatarUrl,
      phone: ride.driver.user.phone,
      rating: ride.driver.rating,
      totalTrips: ride.driver.totalTrips,
      overallStatus: ride.driver.overallStatus,
    },
    vehicle: {
      id: ride.vehicle.id,
      nickname: ride.vehicle.nickname,
      make: ride.vehicle.make,
      model: ride.vehicle.model,
      color: ride.vehicle.color,
      plateNumber: ride.vehicle.plateNumber,
      status: ride.vehicle.status,
    },
    pickup: {
      label: ride.pickupLabel,
      address: ride.pickupAddress,
      lat: ride.pickupLat,
      lng: ride.pickupLng,
    },
    destination: {
      label: ride.destinationLabel,
      address: ride.destinationAddress,
      lat: ride.destinationLat,
      lng: ride.destinationLng,
    },
    fare: Number(ride.fare),
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    rating: ride.rating,
    reviewNote: ride.reviewNote,
    cancelReason: ride.cancelReason,
    cancelRequestedBy: ride.cancelRequestedBy,
    pinFailedAttempts: ride.pinFailedAttempts,
    pinLockedUntil: ride.pinLockedUntil,
    pinVerified: Boolean(ride.verifiedAt),
    pin: extras.pin,
    freeRideApplied: (ride.rewardRedemptions ?? []).some((r) => Number(r.value) > 0),
    timeline: (ride.events ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt,
    })),
    requestedAt: ride.requestedAt,
    acceptedAt: ride.acceptedAt,
    arrivedAt: ride.arrivedAt,
    verifiedAt: ride.verifiedAt,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    cancelledAt: ride.cancelledAt,
    createdAt: ride.createdAt,
  };
}

export type SerializedRide = ReturnType<typeof serializeRide>;

// ---------------------------------------------------------------------------
// Ride code
// ---------------------------------------------------------------------------

export async function nextRideCode(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.ride.count();
  return `GT-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

async function loadRide(id: string) {
  const ride = await prisma.ride.findUnique({
    where: { id },
    include: rideInclude,
  });
  if (!ride) throw notFound('That ride no longer exists.');
  return ride;
}

function assertStatus(ride: { status: RideStatus }, allowed: RideStatus[], action: string) {
  if (!allowed.includes(ride.status)) {
    throw badRequest(
      `This ride is ${statusLabel(ride.status).toLowerCase()}, so it can’t be ${action} right now.`,
    );
  }
}

export function statusLabel(status: RideStatus): string {
  switch (status) {
    case 'REQUESTED':
      return 'Awaiting driver';
    case 'DRIVER_ASSIGNED':
      return 'Driver assigned';
    case 'DRIVER_ARRIVED':
      return 'Driver arrived';
    case 'PIN_VERIFIED':
      return 'Pickup verified';
    case 'IN_PROGRESS':
      return 'On the way';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'NO_SHOW':
      return 'No show';
    default:
      return status;
  }
}

async function recordEvent(
  rideId: string,
  type: RideEventType,
  message: string,
  meta?: Record<string, unknown>,
  actorId?: string,
) {
  await prisma.rideEvent.create({
    data: {
      rideId,
      type,
      message,
      meta: (meta ?? undefined) as never,
      actorId,
    },
  });
}

async function broadcastRide(rideId: string, payload: SerializedRide) {
  emitToRide(rideId, 'trip:state', payload);
  const audience = await rideAudience(rideId);
  for (const userId of audience) emitToUser(userId, 'trip:state', payload);
}

export interface CreateRideInput {
  studentId: string;
  actingUserId: string;
  driverId: string;
  pickup: { label: string; address: string; lat: number; lng: number };
  destination: { label: string; address: string; lat: number; lng: number };
  useFreeRide: boolean;
  parentId?: string | null;
}

export async function createRide(input: CreateRideInput) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: input.studentId },
    include: { user: true },
  });
  if (!student) throw notFound('Student not found.');

  const driver = await prisma.driverProfile.findUnique({
    where: { id: input.driverId },
    include: {
      user: true,
      vehicles: { where: { isActive: true } },
      verifications: true,
    },
  });
  if (!driver) throw notFound('Driver not found.');

  if (driver.overallStatus !== 'VERIFIED') {
    throw badRequest('That driver is not verified yet, so they cannot accept rides.');
  }
  if (driver.backgroundCheckStatus !== 'VERIFIED') {
    throw badRequest('That driver has not passed the background check yet.');
  }
  if (driver.isOnline === false) {
    throw badRequest('That driver is currently offline. Choose another driver.');
  }

  const vehicle = driver.vehicles.find((candidate) => candidate.status === 'VERIFIED');
  if (!vehicle) {
    throw badRequest('That driver has no verified vehicle available for this ride.');
  }

  const active = await prisma.ride.findFirst({
    where: { studentId: student.id, status: { in: ACTIVE_RIDE_STATUSES } },
  });
  if (active) {
    throw badRequest('There is already an active ride for this student. Finish or cancel it first.');
  }

  const driverActive = await prisma.ride.findFirst({
    where: {
      driverId: driver.id,
      status: { in: ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PIN_VERIFIED', 'IN_PROGRESS'] },
    },
  });
  if (driverActive) {
    throw badRequest('That driver is already handling another ride right now.');
  }

  const { distanceKm, durationMin } = estimateRoute(input.pickup, input.destination);
  const fare = quoteFare(distanceKm);

  const created = await prisma.ride.create({
    data: {
      code: await nextRideCode(),
      studentId: student.id,
      parentId: input.parentId ?? null,
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: 'REQUESTED',
      pickupLabel: input.pickup.label,
      pickupAddress: input.pickup.address,
      pickupLat: input.pickup.lat,
      pickupLng: input.pickup.lng,
      destinationLabel: input.destination.label,
      destinationAddress: input.destination.address,
      destinationLat: input.destination.lat,
      destinationLng: input.destination.lng,
      fare,
      distanceKm,
      durationMin,
    },
  });

  const pin = generatePin();
  await prisma.ride.update({
    where: { id: created.id },
    data: { pinHash: encryptPin(pin) },
  });
  const ride = await loadRide(created.id);

  if (input.useFreeRide) {
    await claimFreeRide(student.id, ride.id, ride.fare);
  }

  await recordEvent(
    ride.id,
    'REQUESTED',
    `${student.user.firstName} requested a ride to ${input.destination.label}.`,
    { fare, distanceKm },
    input.actingUserId,
  );

  await notify({
    userId: driver.user.id,
    type: 'RIDE_REQUEST',
    title: 'New ride request',
    body: `${student.user.firstName} ${student.user.lastName} · pickup at ${input.pickup.label}`,
    data: { rideId: ride.id, code: ride.code },
    rideId: ride.id,
  });

  const refreshed = await loadRide(ride.id);
  const serialized = serializeRide(refreshed, { pin });
  emitToRide(ride.id, 'trip:state', serialized);
  emitToUser(driver.user.id, 'ride:requested', serialized);
  const audience = await rideAudience(ride.id);
  for (const userId of audience) emitToUser(userId, 'trip:state', serialized);

  return { ride: serialized, pin };
}

export async function acceptRide(rideId: string, driverUserId: string) {
  const ride = await loadRide(rideId);
  const driver = await prisma.driverProfile.findUnique({ where: { userId: driverUserId } });
  if (!driver || ride.driverId !== driver.id) throw forbidden('This request is not for you.');
  assertStatus(ride, ['REQUESTED'], 'accepted');

  await prisma.ride.update({
    where: { id: rideId },
    data: { status: 'DRIVER_ASSIGNED', acceptedAt: new Date() },
  });
  await recordEvent(rideId, 'DRIVER_ASSIGNED', 'Driver accepted the ride and is on the way.', {}, driverUserId);

  await notifyRideParticipants(rideId, {
    type: 'RIDE_ACCEPTED',
    title: 'Driver on the way',
    body: `${ride.driver.user.firstName} accepted the ride and is heading to ${ride.pickupLabel}.`,
  });

  const updated = await loadRide(rideId);
  const serialized = serializeRide(updated);
  await broadcastRide(rideId, serialized);
  return serialized;
}

export async function declineRide(rideId: string, driverUserId: string, reason?: string) {
  const ride = await loadRide(rideId);
  const driver = await prisma.driverProfile.findUnique({ where: { userId: driverUserId } });
  if (!driver || ride.driverId !== driver.id) throw forbidden('This request is not for you.');
  assertStatus(ride, ['REQUESTED'], 'declined');

  await recordEvent(rideId, 'DRIVER_DECLINED', reason ? `Driver declined: ${reason}` : 'Driver declined the request.', { reason }, driverUserId);

  const audience = await rideAudience(rideId);
  for (const userId of audience) {
    await notify({
      userId,
      type: 'RIDE_REQUEST',
      title: 'Driver unavailable',
      body: 'Your driver declined this request. Please choose another verified driver.',
      data: { rideId },
      rideId,
    });
  }

  // Release the ride so the student can re-book with a different driver.
  await prisma.ride.update({
    where: { id: rideId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Driver declined', cancelRequestedBy: 'DRIVER' },
  });

  const updated = await loadRide(rideId);
  return serializeRide(updated);
}

export async function markArrived(rideId: string, driverUserId: string) {
  const ride = await loadRide(rideId);
  const driver = await prisma.driverProfile.findUnique({ where: { userId: driverUserId } });
  if (!driver || ride.driverId !== driver.id) throw forbidden('You are not assigned to this ride.');
  assertStatus(ride, ['DRIVER_ASSIGNED'], 'marked as arrived');

  await prisma.ride.update({ where: { id: rideId }, data: { status: 'DRIVER_ARRIVED', arrivedAt: new Date() } });
  await recordEvent(rideId, 'DRIVER_ARRIVED', `Driver arrived at ${ride.pickupLabel}.`, {}, driverUserId);

  await notifyRideParticipants(rideId, {
    type: 'RIDE_ARRIVED',
    title: 'Your driver has arrived',
    body: `Meet ${ride.driver.user.firstName} at ${ride.pickupLabel} and share the pickup PIN.`,
  });

  const updated = await loadRide(rideId);
  const serialized = serializeRide(updated);
  await broadcastRide(rideId, serialized);
  return serialized;
}

export interface PinAttemptResult {
  ride: SerializedRide;
  attemptsLeft: number;
}

export async function verifyPickupPin(
  rideId: string,
  driverUserId: string,
  pin: string,
): Promise<PinAttemptResult> {
  const ride = await loadRide(rideId);
  const driver = await prisma.driverProfile.findUnique({ where: { userId: driverUserId } });
  if (!driver || ride.driverId !== driver.id) throw forbidden('You are not assigned to this ride.');
  assertStatus(ride, ['DRIVER_ARRIVED'], 'verified');

  if (ride.pinLockedUntil && ride.pinLockedUntil.getTime() > Date.now()) {
    const waitSec = Math.ceil((ride.pinLockedUntil.getTime() - Date.now()) / 1000);
    throw new AppError(
      `Too many wrong PIN attempts. Try again in ${waitSec} second${waitSec === 1 ? '' : 's'}.`,
      429,
      'PIN_LOCKED',
      { retryAfterSeconds: waitSec },
    );
  }

  if (!ride.pinHash) throw badRequest('This ride has no pickup PIN set.');

  const expected = decryptPin(ride.pinHash);
  const matches =
    expected !== null &&
    expected.length === pin.trim().length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(pin.trim()));

  if (!matches) {
    const attempts = ride.pinFailedAttempts + 1;
    const lock = attempts >= MAX_PIN_ATTEMPTS;
    await prisma.ride.update({
      where: { id: rideId },
      data: {
        pinFailedAttempts: attempts,
        pinLockedUntil: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    await recordEvent(
      rideId,
      'PIN_ATTEMPT_FAILED',
      `Incorrect pickup PIN entered (attempt ${attempts} of ${MAX_PIN_ATTEMPTS}).`,
      { attempts },
      driverUserId,
    );

    if (lock) {
      throw new AppError(
        `Too many wrong PIN attempts. The PIN is locked for ${PIN_LOCK_MINUTES} minutes.`,
        429,
        'PIN_LOCKED',
        { retryAfterSeconds: PIN_LOCK_MINUTES * 60 },
      );
    }

    throw badRequest(`That PIN is not correct. ${MAX_PIN_ATTEMPTS - attempts} attempts left.`, {
      attemptsLeft: MAX_PIN_ATTEMPTS - attempts,
      reason: 'PIN_MISMATCH',
    });
  }

  await prisma.ride.update({
    where: { id: rideId },
    data: { status: 'PIN_VERIFIED', verifiedAt: new Date(), pinFailedAttempts: 0, pinLockedUntil: null },
  });
  await recordEvent(rideId, 'PIN_VERIFIED', 'Pickup PIN verified — student is in the vehicle.', {}, driverUserId);

  await notifyRideParticipants(rideId, {
    type: 'PIN_REMINDER',
    title: 'Pickup verified',
    body: 'The pickup PIN matched. The trip has been verified and can start.',
  });

  const updated = await loadRide(rideId);
  const serialized = serializeRide(updated);
  await broadcastRide(rideId, serialized);
  return { ride: serialized, attemptsLeft: MAX_PIN_ATTEMPTS };
}

export async function startTrip(rideId: string, driverUserId: string) {
  const ride = await loadRide(rideId);
  const driver = await prisma.driverProfile.findUnique({ where: { userId: driverUserId } });
  if (!driver || ride.driverId !== driver.id) throw forbidden('You are not assigned to this ride.');
  assertStatus(ride, ['PIN_VERIFIED'], 'started');

  await prisma.ride.update({ where: { id: rideId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
  await recordEvent(rideId, 'TRIP_STARTED', 'Trip started — live tracking is active.', {}, driverUserId);

  await notifyRideParticipants(rideId, {
    type: 'TRIP_UPDATE',
    title: 'Trip started',
    body: `${ride.student.user.firstName} is on the way to ${ride.destinationLabel}.`,
  });

  const updated = await loadRide(rideId);
  const serialized = serializeRide(updated);
  await broadcastRide(rideId, serialized);
  return serialized;
}

export async function completeTrip(rideId: string, driverUserId: string) {
  const ride = await loadRide(rideId);
  const driver = await prisma.driverProfile.findUnique({ where: { userId: driverUserId } });
  if (!driver || ride.driverId !== driver.id) throw forbidden('You are not assigned to this ride.');
  assertStatus(ride, ['IN_PROGRESS'], 'completed');

  await prisma.ride.update({
    where: { id: rideId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  await recordEvent(rideId, 'TRIP_COMPLETED', `Arrived at ${ride.destinationLabel}. Trip completed.`);

  await prisma.driverProfile.update({
    where: { id: driver.id },
    data: { totalTrips: { increment: 1 }, completedTrips: { increment: 1 } },
  });

  const points = await awardRidePoints(rideId);

  await notifyRideParticipants(rideId, {
    type: 'RIDE_COMPLETED',
    title: 'Ride completed',
    body: points.awarded
      ? `${ride.student.user.firstName} arrived safely. +${points.balance > 0 ? 1 : 0} Guardian Point earned.`
      : `${ride.student.user.firstName} arrived safely.`,
  });

  if (points.rewardsCreated > 0) {
    const studentUser = await prisma.studentProfile.findUnique({
      where: { id: ride.studentId },
      select: { userId: true },
    });
    if (studentUser) {
      await notify({
        userId: studentUser.userId,
        type: 'REWARD_EARNED',
        title: 'FREE RIDE unlocked',
        body: 'You reached 50 Guardian Points — 1 free ride has been added to your rewards.',
        data: { rideId },
        rideId,
      });
    }
  }

  const updated = await loadRide(rideId);
  const serialized = serializeRide(updated);
  await broadcastRide(rideId, serialized);
  return serialized;
}

export async function cancelRide(
  rideId: string,
  actor: { userId: string; role: string },
  reason: string,
) {
  const ride = await loadRide(rideId);
  assertStatus(ride, ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'], 'cancelled');

  const isDriver = (await prisma.driverProfile.findFirst({ where: { userId: actor.userId, id: ride.driverId } })) !== null;
  const isStudent = ride.student.userId === actor.userId;
  const isParent = ride.parent?.userId === actor.userId;
  const isAdmin = actor.role === 'ADMIN';

  if (!isDriver && !isStudent && !isParent && !isAdmin) {
    throw forbidden('You are not part of this ride.');
  }

  await prisma.ride.update({
    where: { id: rideId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason,
      cancelRequestedBy: actor.role as UserRole,
    },
  });
  await recordEvent(rideId, 'RIDE_CANCELLED', `Ride cancelled: ${reason}`, { reason }, actor.userId);

  await notifyRideParticipants(rideId, {
    type: 'TRIP_UPDATE',
    title: 'Ride cancelled',
    body: reason,
  });

  const updated = await loadRide(rideId);
  const serialized = serializeRide(updated);
  await broadcastRide(rideId, serialized);
  return serialized;
}

export async function rateRide(
  rideId: string,
  actor: { userId: string; role: string },
  rating: number,
  note?: string,
) {
  const ride = await loadRide(rideId);
  if (ride.status !== 'COMPLETED') throw badRequest('Only completed rides can be rated.');
  const isStudent = ride.student.userId === actor.userId;
  const isParent = ride.parent?.userId === actor.userId;
  if (!isStudent && !isParent && actor.role !== 'ADMIN') {
    throw forbidden('You are not part of this ride.');
  }

  await prisma.ride.update({
    where: { id: rideId },
    data: { rating, reviewNote: note ?? null },
  });

  const ratings = await prisma.ride.aggregate({
    where: { driverId: ride.driverId, rating: { not: null } },
    _avg: { rating: true },
    _count: true,
  });
  if (ratings._avg.rating != null) {
    await prisma.driverProfile.update({
      where: { id: ride.driverId },
      data: { rating: Number(ratings._avg.rating.toFixed(2)) },
    });
  }

  const updated = await loadRide(rideId);
  const serialized = serializeRide(updated);
  await broadcastRide(rideId, serialized);
  return serialized;
}

async function notifyRideParticipants(
  rideId: string,
  message: { type: Parameters<typeof notify>[0]['type']; title: string; body: string },
) {
  const audience = await rideAudience(rideId);
  for (const userId of audience) {
    await notify({ userId, ...message, data: { rideId }, rideId });
  }
}

export { loadRide };
