import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { sanitizeText } from '@/lib/sanitize';
import { put, del } from '@vercel/blob';

const BLOB_HOST = '.blob.vercel-storage.com';

// Hosts the CSP img-src and next.config remotePatterns actually allow — any
// other https URL would save fine but render broken for everyone.
const ALLOWED_AVATAR_HOSTS = [
  'image.tmdb.org',
  'picsum.photos',
  'placehold.co',
  'images.unsplash.com',
];
function isAllowedAvatarUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return ALLOWED_AVATAR_HOSTS.includes(hostname) || hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

async function uploadAvatarToBlob(userId: string, dataUrl: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  const ext = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
  const blob = await put(`avatars/${userId}.${ext}`, buffer, {
    access: 'public',
    contentType: match[1],
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: {
      id: true, email: true, username: true, displayName: true,
      avatarUrl: true, bio: true, favoriteGenres: true, country: true,
      role: true, isVerified: true, isPrivate: true,
      ratingsCount: true, reviewsCount: true, createdAt: true, listPrefs: true,
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

  if (favoriteGenres !== undefined) {
    if (!Array.isArray(favoriteGenres) || favoriteGenres.some(g => typeof g !== 'string'))
      return err('Favorite genres must be a list of strings');
    if (favoriteGenres.length > 30) return err('Too many favorite genres (max 30)');
    if ((favoriteGenres as string[]).some(g => g.length > 50))
      return err('Genre names must be 50 characters or less');
  }
  if (country !== undefined && country !== null) {
    if (typeof country !== 'string') return err('Invalid country');
    if (country.length > 100) return err('Country must be 100 characters or less');
  }

  if (isPrivate !== undefined && typeof isPrivate !== 'boolean') return err('isPrivate must be a boolean');

  if (avatarUrl !== undefined && avatarUrl !== null) {
    if (typeof avatarUrl !== 'string') return err('Invalid avatar URL');
    const isHttps = avatarUrl.length <= 2000 && isAllowedAvatarUrl(avatarUrl);
    const isDataImage = avatarUrl.startsWith('data:image/') && avatarUrl.length <= 500_000;
    if (!isHttps && !isDataImage) return err('Avatar must be an uploaded image or a supported image URL');
  }

  let finalAvatarUrl = avatarUrl as string | null | undefined;
  if (typeof avatarUrl === 'string' && avatarUrl.startsWith('data:image/')) {
    const uploaded = await uploadAvatarToBlob(auth.sub, avatarUrl).catch(() => null);
    // Without a Blob token (local dev) the data URL is stored as-is
    if (uploaded) finalAvatarUrl = uploaded;
  }

  // Clean up the previous blob when the avatar changes or is removed
  if (avatarUrl !== undefined) {
    const prev = await prisma.user.findUnique({ where: { id: auth.sub }, select: { avatarUrl: true } });
    if (prev?.avatarUrl?.includes(BLOB_HOST) && prev.avatarUrl !== finalAvatarUrl) {
      await del(prev.avatarUrl).catch(() => {});
    }
  }

  const updated = await prisma.user.update({
    where: { id: auth.sub },
    data: {
      ...(displayName !== undefined && { displayName: displayName ? sanitizeText(displayName as string) : null }),
      ...(bio !== undefined && { bio: bio ? sanitizeText(bio as string) : null }),
      ...(avatarUrl !== undefined && { avatarUrl: finalAvatarUrl ?? null }),
      ...(favoriteGenres !== undefined && { favoriteGenres: favoriteGenres as string[] }),
      ...(country !== undefined && { country: country ? sanitizeText(country as string) : null }),
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
