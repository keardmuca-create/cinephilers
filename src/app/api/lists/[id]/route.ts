import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getCurrentUser(req);

  const list = await prisma.customList.findUnique({
    where: { id },
    include: { items: { orderBy: { addedAt: 'desc' } } },
  });
  if (!list) return err('List not found', 404);
  if (!list.isPublic && list.userId !== auth?.sub) return err('Forbidden', 403);

  return ok(list);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id } = await params;
  const list = await prisma.customList.findUnique({ where: { id }, select: { userId: true } });
  if (!list) return err('List not found', 404);
  if (list.userId !== auth.sub) return err('Forbidden', 403);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { name, description, isPublic } = body as { name?: string; description?: string; isPublic?: boolean };
  if (name !== undefined && name.trim().length === 0) return err('List name cannot be empty');

  const updated = await prisma.customList.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(isPublic !== undefined && { isPublic }),
    },
  });

  return ok(updated, 'List updated');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id } = await params;
  const list = await prisma.customList.findUnique({ where: { id }, select: { userId: true } });
  if (!list) return err('List not found', 404);
  if (list.userId !== auth.sub) return err('Forbidden', 403);

  await prisma.customList.delete({ where: { id } });
  return ok(null, 'List deleted');
}
