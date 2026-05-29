"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);

    if (!data.success) { setError(data.message); return; }
    setSent(true);
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-8 shadow-xl">
      <h2 className="text-2xl font-headline font-bold mb-2">Forgot password</h2>
      <p className="text-sm text-muted-foreground mb-6">Enter your email and we&apos;ll send a reset link.</p>

      {sent ? (
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm">Check your inbox for the reset link.</p>
          <Link href="/login" className="text-sm text-primary hover:underline block">Back to login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full rounded-xl h-12" disabled={loading}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </Button>
          <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to login</Link>
        </form>
      )}
    </div>
  );
}
