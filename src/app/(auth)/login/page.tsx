"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clearUserData } from '@/lib/clear-user-data';
import { needsFounderWelcome } from '@/lib/welcome';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resendStatus, setResendStatus] = useState('');
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    setResendStatus('');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      setResendStatus(data.message ?? 'Verification email sent.');
    } catch {
      setResendStatus('Could not send the email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerify(false);
    setResendStatus('');
    setLoading(true);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.message ?? 'Login failed');
      if (data.code === 'EMAIL_NOT_VERIFIED') setNeedsVerify(true);
      return;
    }

    // If a different account was previously signed in on this browser, wipe its
    // local data first so the two accounts can't share watched/activity/list
    // state (the phantom-watch leak came from this exact shared-session path).
    try {
      const prevRaw = localStorage.getItem('cinephilers_user');
      const prev = prevRaw ? JSON.parse(prevRaw) : null;
      if (prev?.id && prev.id !== data.data?.id) clearUserData();
    } catch { /* ignore */ }

    // Persist basic user info so profile shows immediately even after cold starts
    try { localStorage.setItem('cinephilers_user', JSON.stringify(data.data)); } catch { /* ignore */ }

    // Someone who has never picked any genres has never been asked — the field
    // has existed and fed Top Picks for a long time with nothing populating it.
    // They get the welcome screen once. Skipping is remembered per device, so
    // "not now" is not asked again here.
    let skipped = false;
    try { skipped = localStorage.getItem('onboarding-genres-skipped') === 'true'; } catch { /* ignore */ }
    const noGenres = Array.isArray(data.data?.favoriteGenres) && data.data.favoriteGenres.length === 0;

    // A brand-new account is met by the Founder screen before anything else,
    // whether or not it has genres to pick. That one is not skippable per device:
    // it is stamped on the account, so it happens exactly once.
    const founder = needsFounderWelcome(data.data);

    router.push(founder || (noGenres && !skipped) ? '/welcome' : '/profile');
    router.refresh();
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-8 shadow-xl">
      <h2 className="text-2xl font-headline font-bold mb-6">Welcome back</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email or username</Label>
          <Input
            id="identifier"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {needsVerify && (
          <div className="text-sm space-y-1">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-primary hover:underline font-semibold disabled:opacity-60"
            >
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
            {resendStatus && <p className="text-muted-foreground">{resendStatus}</p>}
          </div>
        )}

        <Button type="submit" className="w-full rounded-xl h-12" disabled={loading}>
          {loading ? 'Signing in…' : <><LogIn className="h-4 w-4 mr-2" /> Sign In</>}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        No account?{' '}
        <Link href="/signup" className="text-primary hover:underline font-semibold">
          Sign up
        </Link>
      </p>
    </div>
  );
}
