import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  const url = process.env.DATABASE_URL ?? (isBuild ? 'postgresql://localhost:5432/placeholder' : null);
  if (!url) throw new Error('DATABASE_URL environment variable is not set');
  return new PrismaClient({ accelerateUrl: url });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
