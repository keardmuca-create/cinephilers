
"use client"

import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, MessageCircle, UserPlus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function FriendsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <main className="p-6 pt-10 pb-20 max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-headline font-bold">Friends</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search for friends..."
          className="pl-10 bg-white/5 border-none h-12 rounded-2xl"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-headline font-bold flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Suggested for you
        </h2>
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">No suggestions yet</p>
            <p className="text-sm text-muted-foreground mt-1">We&apos;ll recommend people as the community grows</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-headline font-bold">Your Friends Activity</h2>
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Follow friends to see what they&apos;re watching</p>
        </div>
      </section>
    </main>
  );
}
