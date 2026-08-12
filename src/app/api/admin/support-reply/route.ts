import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';
import { sendSupportReply } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

// Send a support reply as Cinephilers rather than from a personal mailbox.
// Admin-only: this sends mail from the app's own domain to an arbitrary address,
// which is exactly the shape of thing that must never be open to anyone else.
export async function POST(req: NextRequest) {
  const check = await requireAdmin(req);
  if (check.status !== 'ok') {
    return err(check.status === 'unauthenticated' ? 'Unauthorized' : 'Forbidden', check.status === 'unauthenticated' ? 401 : 403);
  }
  const auth = check.auth;

  const { allowed, retryAfter } = await rateLimit(`support-reply:${auth.sub}`, 30, 60_000);
  if (!allowed) return err(`Too many replies. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { to, subject, message } = body as { to?: string; subject?: string; message?: string };
  if (!to || !subject?.trim() || !message?.trim()) {
    return err('to, subject and message are required');
  }
  // Deliberately loose — real addresses are stranger than most patterns allow,
  // and the only cost of a bad one is a bounce to an inbox we control.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return err('That does not look like an email address');
  if (message.length > 5000) return err('Message must be under 5000 characters');

  try {
    await sendSupportReply({ to, subject: subject.trim(), message: message.trim() });
  } catch {
    return err("Couldn't send the reply. Try again.", 502);
  }

  return ok(null, 'Reply sent');
}
