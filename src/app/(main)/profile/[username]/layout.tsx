import type { Metadata } from 'next';
import { prisma } from '@/lib/db';

// Link-preview metadata for shared profile links (the movie layout is the template).
// Generated server-side without the viewer's identity, so we only ever expose what
// the public/limited profile view already shows: name + avatar. For private
// accounts we deliberately omit the stats so a shared link can't leak them.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;

  let user: {
    username: string; displayName: string | null; avatarUrl: string | null;
    bio: string | null; isPrivate: boolean; ratingsCount: number;
    _count: { followers: number };
  } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        username: true, displayName: true, avatarUrl: true, bio: true,
        isPrivate: true, ratingsCount: true,
        _count: { select: { followers: true } },
      },
    });
  } catch { /* fall through to generic */ }

  if (!user) return { title: 'Profile | Cinephilers' };

  const name = user.displayName?.trim() || user.username;
  const title = `${name} (@${user.username}) | Cinephilers`;
  const description = user.isPrivate
    ? `@${user.username}'s profile is private on Cinephilers.`
    : (user.bio?.trim()
        || `${user.ratingsCount} rating${user.ratingsCount === 1 ? '' : 's'} · ${user._count.followers} follower${user._count.followers === 1 ? '' : 's'} · Follow @${user.username} on Cinephilers.`);

  const images = user.avatarUrl ? [{ url: user.avatarUrl, alt: name }] : [];

  return {
    title,
    description,
    openGraph: {
      siteName: 'Cinephilers',
      title,
      description,
      images,
      url: `https://cinephilers.app/profile/${user.username}`,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: user.avatarUrl ? [user.avatarUrl] : [],
    },
  };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
