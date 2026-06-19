import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { sendSupportEmail } from '@/lib/email';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = await rateLimit(`support:${getIp(req)}`, 3, 60_000);
  if (!allowed) return err(`Too many messages. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { name, email, subject, message } = body as Record<string, string>;
  if (!name?.trim()) return err('Name is required');
  if (!email?.trim() || !email.includes('@')) return err('Valid email is required');
  if (!subject?.trim()) return err('Subject is required');
  if (!message?.trim()) return err('Message is required');
  if (message.length > 2000) return err('Message must be under 2000 characters');

  await sendSupportEmail({ name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() });

  return ok(null, 'Message sent! We\'ll get back to you soon.');
}
