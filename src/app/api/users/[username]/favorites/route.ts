import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true } });
  if (!user) return err('User not found', 404);

  const items = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { addedAt: 'asc' },
    take: 4,
  });

  return ok(items);
}
