import { Prisma, RewardStatus } from '@prisma/client';
import { prisma } from './prisma';

export const POINTS_PER_RIDE = 1;
export const POINTS_FOR_FREE_RIDE = 50;

/** Fixed-width so reward codes sort predictably in the UI. */
export function generateRewardCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `GT-FREE-${out}`;
}

export interface PointLedgerEntry {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  note: string | null;
  createdAt: Date;
  rideId: string | null;
}

/**
 * Awards exactly one point for a completed ride and mints free-ride rewards
 * whenever the balance crosses a multiple of 50.
 *
 * `rideId` is unique in the ledger, so a ride can never be counted twice even
 * if completion is retried.
 */
export async function awardRidePoints(rideId: string): Promise<{
  awarded: boolean;
  balance: number;
  rewardsCreated: number;
}> {
  return prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({
      where: { id: rideId },
      select: { id: true, studentId: true, status: true, fare: true },
    });
    if (!ride || ride.status !== 'COMPLETED') {
      return { awarded: false, balance: 0, rewardsCreated: 0 };
    }

    const existing = await tx.guardianPoint.findUnique({ where: { rideId } });
    const latest = await tx.guardianPoint.findFirst({
      where: { studentId: ride.studentId },
      orderBy: { createdAt: 'desc' },
    });
    let balance = latest?.balanceAfter ?? 0;

    if (existing) {
      return { awarded: false, balance, rewardsCreated: 0 };
    }

    balance += POINTS_PER_RIDE;
    await tx.guardianPoint.create({
      data: {
        studentId: ride.studentId,
        rideId: ride.id,
        delta: POINTS_PER_RIDE,
        reason: 'RIDE_COMPLETED',
        balanceAfter: balance,
        note: `Ride ${ride.id} completed`,
      },
    });

    let rewardsCreated = 0;
    const earnedRewards = Math.floor(balance / POINTS_FOR_FREE_RIDE);

    for (let i = 0; i < earnedRewards; i += 1) {
      const batchKey = `batch-${Math.floor((balance - i) / POINTS_FOR_FREE_RIDE)}`;
      const alreadyIssued = await tx.reward.findFirst({
        where: { studentId: ride.studentId, batchKey },
      });
      if (alreadyIssued) continue;

      await tx.reward.create({
        data: {
          studentId: ride.studentId,
          type: 'FREE_RIDE',
          title: '1 FREE RIDE',
          costPoints: POINTS_FOR_FREE_RIDE,
          batchKey,
          status: RewardStatus.ISSUED,
          code: generateRewardCode(),
        },
      });
      rewardsCreated += 1;
    }

    return { awarded: true, balance, rewardsCreated };
  });
}

export async function getBalance(studentId: string): Promise<number> {
  const latest = await prisma.guardianPoint.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
  return latest?.balanceAfter ?? 0;
}

export async function getLedger(studentId: string, limit = 50): Promise<PointLedgerEntry[]> {
  const rows = await prisma.guardianPoint.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      delta: true,
      reason: true,
      balanceAfter: true,
      note: true,
      createdAt: true,
      rideId: true,
    },
  });
  return rows.map((row) => ({ ...row, reason: String(row.reason) }));
}

export interface RewardSummary {
  id: string;
  title: string;
  code: string;
  status: RewardStatus;
  issuedAt: Date;
  expiresAt: Date | null;
}

export async function getRewards(studentId: string): Promise<RewardSummary[]> {
  return prisma.reward.findMany({
    where: { studentId },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      title: true,
      code: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
    },
  });
}

/**
 * Claims the oldest available free ride for a ride being booked.
 * Returns the redeemed amount (0 when no reward is available or already used).
 */
export async function claimFreeRide(
  studentId: string,
  rideId: string,
  fare: Prisma.Decimal,
): Promise<{ rewardId: string | null; value: number }> {
  return prisma.$transaction(async (tx) => {
    const existingRedemption = await tx.rewardRedemption.findFirst({ where: { rideId } });
    if (existingRedemption) {
      return { rewardId: existingRedemption.rewardId, value: Number(existingRedemption.value) };
    }

    const reward = await tx.reward.findFirst({
      where: { studentId, status: RewardStatus.ISSUED },
      orderBy: { issuedAt: 'asc' },
    });
    if (!reward) return { rewardId: null, value: 0 };

    const value = Number(fare);

    await tx.reward.update({
      where: { id: reward.id },
      data: { status: RewardStatus.REDEEMED, redeemedAt: new Date(), freeRideForRideId: rideId },
    });

    await tx.rewardRedemption.create({
      data: { rewardId: reward.id, rideId, value: new Prisma.Decimal(value) },
    });

    // The ledger's `rideId` column is unique and reserved for that ride's own
    // earned point, so the redemption is recorded against the student balance
    // with the ride referenced in the note (the ride link itself lives on
    // Reward.freeRideForRideId, which is also unique).
    await tx.guardianPoint.create({
      data: {
        studentId,
        rideId: null,
        delta: -reward.costPoints,
        reason: 'ADMIN_ADJUSTMENT',
        balanceAfter: (await currentBalance(tx, studentId)) - reward.costPoints,
        note: `Redeemed ${reward.code} — 1 FREE RIDE (ride ${rideId})`,
      },
    });

    return { rewardId: reward.id, value };
  });
}

async function currentBalance(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<number> {
  const latest = await tx.guardianPoint.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
  return latest?.balanceAfter ?? 0;
}
