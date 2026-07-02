import { ok } from '@/lib/api-response';
import { clearAuthCookies } from '@/lib/auth-utils';

// Logout is per-device: it only clears THIS browser's cookies. Sessions on
// other devices stay signed in (IMDb-style "log in once, never again") thanks
// to the 90-day sliding refresh window. Revoking ALL sessions at once is
// reserved for password reset, which bumps user.tokenVersion.
export async function POST() {
  await clearAuthCookies();
  return ok(null, 'Logged out');
}
