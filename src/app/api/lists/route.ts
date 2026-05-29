import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { name, description, isPublic } = body as { name: string; description?: string; isPublic?: boolean };
  if (!name || name.trim().length === 0) return err('List name is required');
  if (name.trim().length > 100) return err('List name must be 100 characters or less');

  const list = await prisma.customList.create({
    data: {
      userId: auth.sub,
      name: name.trim(),
      description: description?.trim() || null,
      isPublic: isPublic ?? true,
    },
  });

  return ok(list, 'List created', { status: 201 });
}
