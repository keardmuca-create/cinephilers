import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { mockDb } from './mock-db';

const globalForPrisma = globalThis as unknown as { prisma: unknown };

function createClient(): unknown {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[db] DATABASE_URL not set — using in-memory mock database');
    }
    return mockDb;
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = (globalForPrisma.prisma ?? createClient()) as PrismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
