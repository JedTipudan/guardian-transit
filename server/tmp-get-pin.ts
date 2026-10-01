import { prisma } from './src/lib/prisma';
import { decryptPin } from './src/services/rides';

async function main() {
  const rides = await prisma.ride.findMany({
    where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: { code: true, status: true, pinHash: true },
  });
  for (const r of rides) {
    console.log(r.code, r.status, r.pinHash ? decryptPin(r.pinHash) : 'no-pin');
  }
}

main().finally(() => prisma.$disconnect());
