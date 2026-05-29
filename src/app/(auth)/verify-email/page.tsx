"use client"

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle } from 'lucide-react';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Invalid verification link.'); return; }

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStatus('success');
          setMessage(data.message ?? 'Email verified!');
          setTimeout(() => router.push('/login'), 3000);
        } else {
          setStatus('error');
          setMessage(data.message ?? 'Verification failed.');
        }
      })
      .catch(() => { setStatus('error'); setMessage('Something went wrong.'); });
  }, [token, router]);

  if (status === 'loading') return <p className="text-sm text-muted-foreground text-center">Verifying…</p>;

  return (
    <div className="text-center space-y-4">
      {status === 'success' ? (
        <CheckCircle className="h-16 w-16 text-primary mx-auto" />
      ) : (
        <XCircle className="h-16 w-16 text-destructive mx-auto" />
      )}
      <p className="text-sm">{message}</p>
      {status === 'success' && <p className="text-xs text-muted-foreground">Redirecting to login…</p>}
      {status === 'error' && (
        <Link href="/forgot-password" className="text-sm text-primary hover:underline block">
          Resend verification email
        </Link>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="bg-card border border-border rounded-3xl p-8 shadow-xl">
      <h2 className="text-2xl font-headline font-bold mb-6 text-center">Email Verification</h2>
      <Suspense fallback={<p className="text-sm text-muted-foreground text-center">Loading…</p>}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
