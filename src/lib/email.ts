import { Resend } from 'resend';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
const FROM = process.env.EMAIL_FROM ?? 'Cinephilers <onboarding@resend.dev>';
const BASE_URL = process.env.APP_URL ?? 'https://cinephilers.app';

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${BASE_URL}/reset-password?token=${token}`;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: 'Reset your Cinephilers password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#f5f5f5;border-radius:16px;">
        <h2 style="margin:0 0 8px;font-size:22px;">Password Reset</h2>
        <p style="color:#aaa;margin:0 0 24px;">Click the button below to reset your Cinephilers password. This link expires in <strong style="color:#f5f5f5;">1 hour</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:14px 28px;background:#dc2626;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Reset Password</a>
        <p style="margin-top:24px;color:#666;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />
        <p style="color:#444;font-size:12px;margin:0;">Cinephilers · <a href="${BASE_URL}" style="color:#666;">${BASE_URL}</a></p>
      </div>
    `,
  });
}

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${BASE_URL}/verify-email?token=${token}`;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: 'Verify your Cinephilers account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#f5f5f5;border-radius:16px;">
        <h2 style="margin:0 0 8px;font-size:22px;">Welcome to Cinephilers!</h2>
        <p style="color:#aaa;margin:0 0 24px;">Click the button below to verify your email address. This link expires in <strong style="color:#f5f5f5;">24 hours</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:14px 28px;background:#dc2626;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Verify Email</a>
        <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />
        <p style="color:#444;font-size:12px;margin:0;">Cinephilers · <a href="${BASE_URL}" style="color:#666;">${BASE_URL}</a></p>
      </div>
    `,
  });
}

export async function sendSupportEmail(opts: { name: string; email: string; subject: string; message: string }) {
  const supportInbox = process.env.SUPPORT_EMAIL ?? 'onboarding@resend.dev';
  await getResend().emails.send({
    from: FROM,
    to: supportInbox,
    replyTo: opts.email,
    subject: `[Support] ${opts.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#f5f5f5;border-radius:16px;">
        <h2 style="margin:0 0 16px;font-size:20px;">New Support Request</h2>
        <p style="margin:0 0 4px;color:#aaa;font-size:13px;">From</p>
        <p style="margin:0 0 16px;font-weight:700;">${opts.name} &lt;${opts.email}&gt;</p>
        <p style="margin:0 0 4px;color:#aaa;font-size:13px;">Subject</p>
        <p style="margin:0 0 16px;font-weight:700;">${opts.subject}</p>
        <p style="margin:0 0 4px;color:#aaa;font-size:13px;">Message</p>
        <p style="margin:0;white-space:pre-wrap;line-height:1.6;">${opts.message}</p>
        <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />
        <p style="color:#444;font-size:12px;margin:0;">Reply directly to this email to respond to ${opts.name}.</p>
      </div>
    `,
  });
}
