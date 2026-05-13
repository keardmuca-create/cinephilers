
"use client"

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { SocialPost, SocialAction } from '@/lib/types';
import { Heart, MessageSquare, Repeat2, MoreHorizontal, Star, UserPlus, Share2, AlertTriangle, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

export default function SocialPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [friendSearch, setFriendSearch] = useState('');

  const handleLike = (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const isLiked = p.likes.includes('u1');
        return {
          ...p,
          likes: isLiked ? p.likes.filter(id => id !== 'u1') : [...p.likes, 'u1'],
        };
      }
      return p;
    }));
  };

  const filteredFriends = useMemo(() => [], [friendSearch]);

  const getActionText = (action: SocialAction) => {
    switch (action) {
      case 'watched': return 'just watched';
      case 'rated': return 'rated';
      case 'reviewed': return 'reviewed';
      case 'watchlist': return 'added to watchlist';
      case 'rewatched': return 'rewatched';
      default: return 'interacted with';
    }
  };

  return (
    <main className="max-w-xl mx-auto p-6 pt-10 pb-20 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-headline font-bold">Social</h1>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full border-white/10 bg-white/5 hover:bg-primary hover:border-primary transition-all">
              <UserPlus className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden">
            <div className="p-6 pb-2">
              <DialogHeader>
                <DialogTitle className="font-headline text-2xl">Find Friends</DialogTitle>
              </DialogHeader>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or username..."
                  className="pl-10 bg-white/5 border-none h-11 rounded-xl"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="h-[400px] px-6 pb-6">
              <div className="space-y-4 pt-4">
                {filteredFriends.length > 0 ? (
                  filteredFriends.map((friend: { id: string; name: string; username: string; avatar: string }) => (
                    <div key={friend.id} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10"><AvatarImage src={friend.avatar} /></Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{friend.name}</span>
                          <span className="text-xs text-muted-foreground">{friend.username}</span>
                        </div>
                      </div>
                      <Button size="sm" className="rounded-full px-4">Follow</Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    {friendSearch ? `No results for "${friendSearch}"` : 'Search to find friends'}
                  </div>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Heart className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold font-headline text-lg">Nothing here yet</p>
              <p className="text-sm text-muted-foreground mt-1">Follow friends to see their activity</p>
            </div>
          </div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="bg-card rounded-3xl p-6 border border-white/5 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                    <AvatarImage src={post.userAvatar} />
                    <AvatarFallback>{post.userName[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="text-sm font-bold font-headline">{post.userName}</h4>
                    <p className="text-xs text-muted-foreground capitalize">
                      {getActionText(post.action)} • {post.timestamp}
                    </p>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl border-white/10 bg-popover/90 backdrop-blur-xl p-1">
                    <DropdownMenuItem className="gap-2 cursor-pointer p-3 rounded-lg" onClick={() => toast({ title: 'Shared successfully' })}>
                      <Share2 className="h-4 w-4" /> Share Activity
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive cursor-pointer p-3 rounded-lg" onClick={() => toast({ title: 'Activity reported' })}>
                      <AlertTriangle className="h-4 w-4" /> Report Activity
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Link href={`/movie/${post.contentId}`} className="block group">
                <div className="bg-white/5 rounded-2xl p-4 flex gap-4 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
                  <div className="relative aspect-[2/3] w-24 rounded-lg overflow-hidden shrink-0 shadow-lg">
                    <Image src={`https://picsum.photos/seed/${post.contentId}/200/300`} alt={post.contentTitle} fill className="object-cover" />
                  </div>
                  <div className="flex flex-col justify-center gap-2 overflow-hidden flex-1">
                    <h3 className="font-bold font-headline text-lg group-hover:text-primary transition-colors truncate">{post.contentTitle}</h3>
                    {post.rating && (
                      <div className="flex items-center gap-1 text-accent font-bold text-sm bg-accent/10 w-fit px-2 py-0.5 rounded-full">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {post.rating} / 10
                      </div>
                    )}
                    {post.review && <p className="text-sm text-gray-300 line-clamp-3 italic leading-relaxed">&ldquo;{post.review}&rdquo;</p>}
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-6 pt-2">
                <button
                  onClick={() => handleLike(post.id)}
                  className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
                >
                  <Heart className={`h-5 w-5 ${post.likes.includes('u1') ? 'fill-primary text-primary' : ''}`} />
                  {post.likes.length}
                </button>

                <Dialog>
                  <DialogTrigger asChild>
                    <button className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors">
                      <MessageSquare className="h-5 w-5" />
                      {post.comments.length}
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-3xl">
                    <DialogHeader>
                      <DialogTitle className="font-headline">Comments</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-60 pr-4">
                      <div className="space-y-6 pt-4">
                        {post.comments.length > 0 ? (
                          post.comments.map(c => (
                            <div key={c.id} className="flex gap-3">
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={`https://picsum.photos/seed/${c.userId}/100/100`} />
                                <AvatarFallback>{c.userName[0]}</AvatarFallback>
                              </Avatar>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold font-headline">{c.userName}</span>
                                  <span className="text-[10px] text-muted-foreground">{c.timestamp}</span>
                                </div>
                                <p className="text-sm text-gray-300">{c.content}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-muted-foreground py-10">No comments yet. Be the first!</p>
                        )}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>

                <button className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors">
                  <Repeat2 className="h-5 w-5" />
                  Share
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
