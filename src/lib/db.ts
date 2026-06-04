import { PrismaClient } from '@/generated/prisma/client';
import { mockDb } from './mock-db';

const globalForPrisma = globalThis as unknown as { prisma: unknown };

function createClient(): unknown {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[db] DATABASE_URL not set — using in-memory mock database');
    }
    return mockDb;
  }
  return new PrismaClient();
}

export const prisma = (globalForPrisma.prisma ?? createClient()) as PrismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
