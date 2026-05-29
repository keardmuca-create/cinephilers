import nodemailer from 'nodemailer';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.SMTP_FROM ?? 'Cinephilers <no-reply@cinephilers.app>';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://cinephilers.app';

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${BASE_URL}/verify-email?token=${token}`;
  const transporter = createTransport();
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Verify your Cinephilers account',
    html: `
      <h2>Welcome to Cinephilers!</h2>
      <p>Click the link below to verify your email address. The link expires in 24 hours.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Verify Email</a>
      <p style="margin-top:16px;color:#666;font-size:14px;">Or copy this URL: ${link}</p>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${BASE_URL}/reset-password?token=${token}`;
  const transporter = createTransport();
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Reset your Cinephilers password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. The link expires in 1 hour.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a>
      <p style="margin-top:16px;color:#666;font-size:14px;">If you didn&apos;t request this, you can safely ignore this email.</p>
    `,
  });
}
