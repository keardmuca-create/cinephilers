import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  // Falls back to a placeholder during build — actual DB URL is required at runtime
  const url = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/cinephilers';
  return new PrismaClient({ accelerateUrl: url });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
