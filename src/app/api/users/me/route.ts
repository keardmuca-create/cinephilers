import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { sanitizeText } from '@/lib/sanitize';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: {
      id: true, email: true, username: true, displayName: true,
      avatarUrl: true, bio: true, favoriteGenres: true, country: true,
      role: true, isVerified: true, isPrivate: true,
      ratingsCount: true, reviewsCount: true, createdAt: true,
      _count: { select: { followers: true, following: true } },
    },
  });
  if (!user) return err('User not found', 404);

  return ok({ ...user, followersCount: user._count.followers, followingCount: user._count.following });
}

export async function PUT(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { displayName, bio, avatarUrl, favoriteGenres, country, isPrivate } = body as Record<string, unknown>;

  if (displayName && typeof displayName === 'string' && displayName.length > 50)
    return err('Display name must be 50 characters or less');
  if (bio && typeof bio === 'string' && bio.length > 300)
    return err('Bio must be 300 characters or less');

  if (avatarUrl !== undefined && avatarUrl !== null) {
    if (typeof avatarUrl !== 'string') return err('Invalid avatar URL');
    const isHttps = avatarUrl.startsWith('https://') && avatarUrl.length <= 2000;
    const isDataImage = avatarUrl.startsWith('data:image/') && avatarUrl.length <= 500_000;
    if (!isHttps && !isDataImage) return err('Avatar must be an https URL or an uploaded image');
  }

  const updated = await prisma.user.update({
    where: { id: auth.sub },
    data: {
      ...(displayName !== undefined && { displayName: displayName ? sanitizeText(displayName as string) : null }),
      ...(bio !== undefined && { bio: bio ? sanitizeText(bio as string) : null }),
      ...(avatarUrl !== undefined && { avatarUrl: avatarUrl as string | null }),
      ...(favoriteGenres !== undefined && { favoriteGenres: favoriteGenres as string[] }),
      ...(country !== undefined && { country: country as string | null }),
      ...(isPrivate !== undefined && { isPrivate: isPrivate as boolean }),
    },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      bio: true, favoriteGenres: true, country: true, isPrivate: true,
    },
  });

  return ok(updated, 'Profile updated');
}

export async function DELETE(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  // Hard delete — cascades to all related data (ratings, reviews, watchlist, etc.)
  await prisma.user.delete({ where: { id: auth.sub } });

  return ok(null, 'Account deleted');
}
