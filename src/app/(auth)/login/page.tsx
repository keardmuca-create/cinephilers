"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clearUserData } from '@/lib/clear-user-data';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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

    router.push('/profile');
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
