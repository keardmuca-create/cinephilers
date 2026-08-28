"use client"

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// An in-app replacement for window.confirm.
//
// The native one is not just ugly in a phone-shaped app — it freezes the JS
// thread, it renders as the operating system's alert rather than ours, and the
// browser is allowed to switch it off entirely. Chrome offers "prevent this page
// from creating additional dialogs" after a couple of them, and once somebody
// ticks that box every confirm() silently returns false forever, which turns a
// delete button into a button that does nothing.
//
// It also never let us say what the button does. "OK" is what the OS calls
// deleting a list; here the button says Delete, it's crimson, and the safe
// choice sits to its left.
//
// Deliberately promise-shaped so call sites keep the line they already had:
//
//   if (!(await confirm({ title: '…', confirmLabel: 'Delete' }))) return;
//
// Anything else would mean every caller growing its own open/closed state.

export interface ConfirmOptions {
  /** The question. Kept short — this is the line people actually read. */
  title: string;
  /** What happens, and whether it can be taken back. Optional. */
  description?: string;
  /** The verb, not "OK". Defaults to Delete since that's what these all are. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Crimson by default. Set false for a confirmation that isn't destructive. */
  destructive?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** Ask the user to confirm. Resolves false if they cancel or dismiss. */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ask;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // Held in a ref rather than state: settling the promise must not depend on a
  // render having happened.
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const ask = useCallback<Ask>(opts => {
    setOptions(opts);
    return new Promise<boolean>(resolve => { resolveRef.current = resolve; });
  }, []);

  const settle = useCallback((answer: boolean) => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog
        open={options !== null}
        // Dismissing — the X, Escape, or a tap outside — is a cancel. Safe to
        // allow, because cancel is the outcome that changes nothing.
        onOpenChange={open => { if (!open) settle(false); }}
      >
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-headline font-bold leading-snug pr-6 text-left">
              {options?.title}
            </DialogTitle>
          </DialogHeader>

          {options?.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{options.description}</p>
          )}

          {/* Safe choice on the left, the one that does something on the right —
              the order every phone uses, so muscle memory still works. */}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={() => settle(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={options?.destructive === false ? 'default' : 'destructive'}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
