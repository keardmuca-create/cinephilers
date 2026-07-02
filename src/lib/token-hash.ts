import crypto from 'crypto';

// Email-verification and password-reset tokens are stored hashed, so a DB leak
// (backup, Prisma Studio, compromised tooling) can't be replayed for account
// takeover. The raw token goes only into the email link; lookups hash the
// submitted value and match against the stored digest.
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
