"use client"

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, UserPlus, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Debounced username availability check
  useEffect(() => {
    const u = form.username.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!u) { setUsernameStatus('idle'); return; }
    if (!USERNAME_RE.test(u)) { setUsernameStatus('invalid'); return; }

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?u=${encodeURIComponent(u)}`);
        const json = await res.json();
        setUsernameStatus(json.data?.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus === 'taken') { setError('That username is already taken.'); return; }
    if (usernameStatus === 'invalid') { setError('Username must be 3–20 chars, letters, numbers, underscores only.'); return; }
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.message ?? 'Registration failed');
      return;
    }

    setSuccess(data.message ?? 'Account created! Check your email to verify.');
    setTimeout(() => router.push('/login'), 3000);
  };

  const usernameHint = () => {
    if (usernameStatus === 'checking') return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
      </span>
    );
    if (usernameStatus === 'available') return (
      <span className="flex items-center gap-1 text-green-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> Available
      </span>
    );
    if (usernameStatus === 'taken') return (
      <span className="flex items-center gap-1 text-destructive">
        <XCircle className="h-3.5 w-3.5" /> Already taken
      </span>
    );
    if (usernameStatus === 'invalid') return (
      <span className="text-muted-foreground">3–20 chars, letters, numbers, underscores</span>
    );
    return <span className="text-muted-foreground">3–20 chars, letters, numbers, underscores</span>;
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-8 shadow-xl">
      <h2 className="text-2xl font-headline font-bold mb-6">Create account</h2>

      {success ? (
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm text-foreground">{success}</p>
          <p className="text-xs text-muted-foreground">Redirecting to login…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={set('username')}
              placeholder="cinephile42"
              required
              className={
                usernameStatus === 'available' ? 'border-green-500 focus-visible:ring-green-500/30' :
                usernameStatus === 'taken' ? 'border-destructive focus-visible:ring-destructive/30' :
                ''
              }
            />
            <p className="text-xs">{usernameHint()}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full rounded-xl h-12"
            disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}
          >
            {loading ? 'Creating account…' : <><UserPlus className="h-4 w-4 mr-2" />Create Account</>}
          </Button>
        </form>
      )}

      {!success && (
        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-semibold">Sign in</Link>
        </p>
      )}
    </div>
  );
}
