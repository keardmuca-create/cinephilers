"use client"

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sparkles, Bookmark, Lock, Check } from 'lucide-react';

// What Today's Pick is, said once, properly.
//
// Nothing on the home screen explained it. Someone arriving cold sees a button
// called Generate and a line of encouragement, and has to press it to find out
// what it does — and the two rules that matter most (it comes from YOUR
// watchlist, and it is locked for the day) are invisible until they have already
// happened to you. The point of writing it down is the watchlist: the pick is
// only as good as the list behind it, and nobody keeps a list full for a feature
// they have not understood yet.
function Rule({ icon: Icon, title, children }: {
  icon: typeof Sparkles;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-bold font-headline leading-snug">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

export function TodaysPickHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline">How Today&apos;s Pick works</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2 overflow-y-auto flex-1 pr-1">
          <Rule icon={Bookmark} title="It comes from your watchlist">
            One film, chosen at random from the films you have saved and not yet
            watched. It is your list — so the fuller you keep it, the better the
            pick. An empty watchlist has nothing to choose from.
          </Rule>

          <Rule icon={Sparkles} title="Films only">
            Shows are not picked. A series is a dozen evenings, and this is for
            deciding what to watch tonight.
          </Rule>

          <Rule icon={Lock} title="One a day, and it is locked">
            Once you generate, that is your pick until tomorrow — on every device,
            and it cannot be rerolled. Choosing is the part this is meant to take
            off your hands, and a pick you can reroll is just scrolling again.
            A film that comes up stays out of the running for two weeks
            afterwards.
          </Rule>

          <Rule icon={Check} title="Only released films">
            Anything on your watchlist that is not out yet is skipped, so the pick
            is always something you can actually watch.
          </Rule>

          {/* "About badges" used to sit here, behind a divider. It has moved to
              the Badges page, where somebody is already looking at badges and
              wondering how they work. A sheet titled "How Today's Pick works"
              should answer that question and stop. */}
        </div>
      </DialogContent>
    </Dialog>
  );
}
