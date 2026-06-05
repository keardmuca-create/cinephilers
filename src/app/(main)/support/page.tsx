"use client"

import React, { useState } from 'react';
import { Send, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';

export default function SupportPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user?.displayName ?? user?.username ?? '',
    email: user?.email ?? '',
    subject: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message ?? 'Something went wrong'); return; }
      setSuccess(true);
    } catch {
      setError('Failed to send. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-lg mx-auto px-4 pt-10 pb-32 space-y-8">
      <div className="space-y-2 px-1">
        <h1 className="text-3xl font-headline font-bold">Support</h1>
        <p className="text-muted-foreground text-sm">Have a question or issue? We&apos;ll get back to you as soon as possible.</p>
      </div>

      <div className="bg-card border border-white/5 rounded-3xl p-6 shadow-lg">
        {success ? (
          <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <p className="font-bold font-headline text-lg">Message sent!</p>
              <p className="text-sm text-muted-foreground mt-1">We&apos;ll get back to you at <strong>{form.email}</strong> soon.</p>
            </div>
            <Button variant="outline" className="rounded-xl mt-2" onClick={() => { setSuccess(false); setForm(f => ({ ...f, subject: '', message: '' })); }}>
              Send another
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={set('name')} placeholder="Your name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={form.subject} onChange={set('subject')} placeholder="What's this about?" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={form.message}
                onChange={set('message')}
                placeholder="Describe your issue or question…"
                className="min-h-[140px] resize-none"
                required
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">{form.message.length}/2000</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full rounded-xl h-12 gap-2" disabled={loading}>
              {loading ? 'Sending…' : <><Send className="h-4 w-4" />Send Message</>}
            </Button>
          </form>
        )}
      </div>

      <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
        <Mail className="h-4 w-4 shrink-0" />
        <span>You can also reach us at <strong className="text-foreground">support@cinephilers.app</strong></span>
      </div>
    </main>
  );
}
