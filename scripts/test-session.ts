// Mint a signed session for a seeded test user.
//
// Claude cannot type into the login form, and the browser holds one cookie jar,
// so "log in as three people" is not available. What IS available: getCurrentUser
// reads the access_token cookie and verifies its signature, and nothing else. So
// a correctly signed token IS a session, and one can be made for each seeded user
// without a password ever being typed.
//
// The secret comes from .env.local — the same file the dev server reads — because
// a token signed with a different secret is just a 401.
//
// Expiry is deliberately longer than the app's 15 minutes. Real sessions stay
// alive by refreshing; a test run has no refresh loop and should not fail halfway
// through because a token aged out mid-scenario.
//
//   npx tsx scripts/test-session.ts test_alpha
//
import 'dotenv/config';
import { config } from 'dotenv';
import { SignJWT } from 'jose';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readTestEnv } from '../src/lib/test-db-guard';

config({ path: '.env.local' });

const TEST_TOKEN_EXPIRY = '12h';

export async function mintSession(username: string): Promise<{ id: string; username: string; cookie: string }> {
  const env = readTestEnv();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DIRECT_URL }) });
  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true, tokenVersion: true },
    });
    if (!user) throw new Error(`No user "${username}" in the test database. Run seed-test-users.ts first.`);

    // Mirrors requireSecret() in auth-utils: the dev fallback is what `next dev`
    // uses when the variable is unset, so signing with it matches the server.
    const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-jwt_access_secret-change-me';

    const accessSecret = new TextEncoder().encode(secret);
    const refreshSecret = new TextEncoder().encode(
      process.env.JWT_REFRESH_SECRET ?? 'dev-jwt_refresh_secret-change-me',
    );
    const claims = { sub: user.id, username: user.username, role: user.role };

    const access = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(TEST_TOKEN_EXPIRY)
      .sign(accessSecret);

    // A refresh token as well, and not for tidiness: the app retries a 401 by
    // refreshing, and when that fails it CLEARS the session. An access token on
    // its own therefore logs itself out the moment anything 401s, which is what
    // emptied the badges page mid-run. The version claim has to match the row or
    // the refresh route rejects it.
    const refresh = await new SignJWT({ ...claims, ver: user.tokenVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(refreshSecret);

    return { id: user.id, username: user.username, cookie: `access_token=${access}; refresh_token=${refresh}` };
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('test-session.ts')) {
  const username = process.argv[2];
  if (!username) { console.error('usage: npx tsx scripts/test-session.ts <username>'); process.exit(1); }
  mintSession(username)
    .then(s => { console.log(s.cookie); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
