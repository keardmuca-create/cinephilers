"use client"

import React from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Film } from 'lucide-react';

interface AuthGateModalProps {
  open: boolean;
  onClose: () => void;
  action?: string;
}

export function AuthGateModal({ open, onClose, action }: AuthGateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm rounded-3xl bg-background border-border text-center">
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Film className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1.5">
            {/* The dialog's heading proper, not a loose h2 — it already read as
                the title on screen, but nothing told a screen reader that. */}
            <DialogTitle className="text-xl font-headline font-bold">Join Cinephilers</DialogTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {action
                ? `Create a free account to ${action} — and track every film and show you watch.`
                : 'Create a free account to track every film and show you watch, rate them, and follow friends.'}
            </p>
          </div>
          {/* Create Account is primary: a visitor hitting this from a shared
              link is almost always new, not returning. */}
          <div className="flex flex-col gap-2 w-full pt-1">
            <Button asChild className="w-full rounded-xl h-12 font-bold" onClick={onClose}>
              <Link href="/signup">Create free account</Link>
            </Button>
            <Button asChild variant="outline" className="w-full rounded-xl h-12 font-bold" onClick={onClose}>
              <Link href="/login">I already have one</Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
