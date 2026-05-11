
"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Movie, Actor } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Play, Check, Plus, Star, ChevronLeft, Share2, ListPlus, Award, Quote, Info, Film, Calendar, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

function DetailSkeleton() {
  return (
    <main className="min-h-screen pb-32 bg-background">
      <div className="relative w-full h-[50vh] bg-muted animate-pulse" />
      <div className="px-6 space-y-12 mt-8">
        <div className="flex gap-8">
          <Skeleton className="w-48 aspect-[2/3] rounded-[2rem] shrink-0" />
          <div className="flex-1 space-y-4 pt-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}

function PersonCard({ actor }: { actor: Actor }) {
  const avatarSrc = actor.id.startsWith('tmdb-')
    ? `https://picsum.photos/seed/${actor.id}/200/200`
    : `https://picsum.photos/seed/${actor.id}/200/200`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="shrink-0 w-32 group cursor-pointer">
          <div className="relative aspect-square rounded-2xl overflow-hidden mb-2 group-hover:ring-2 ring-primary ring-offset-2 ring-offset-background transition-all">
            <Image src={avatarSrc} alt={actor.name} fill className="object-cover" />
          </div>
          <h4 className="text-sm font-bold font-headline line-clamp-1">{actor.name}</h4>
          <p className="text-xs text-muted-foreground line-clamp-1">{actor.role}</p>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-headline">Person Details</DialogTitle>
        </DialogHeader>
        <div className="flex gap-6 py-4">
          <Avatar className="h-24 w-24"><AvatarImage src={avatarSrc} /></Avatar>
          <div className="space-y-2">
            <h3 className="text-xl font-bold font-headline">{actor.name}</h3>
            <p className="text-sm text-primary font-bold">{actor.role}</p>
            {actor.bio && <p className="text-xs text-muted-foreground">{actor.bio}</p>}
          </div>
        </div>
        {actor.knownFor.length > 0 && (
          <>
            <Separator className="bg-white/5" />
            <div className="space-y-3">
              <h4 className="text-sm font-bold font-headline">Known For</h4>
              <div className="flex flex-wrap gap-2">
                {actor.knownFor.map(m => (
                  <span key={m} className="bg-white/5 text-xs px-3 py-1 rounded-full">{m}</span>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWatched, setIsWatched] = useState(false);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [userRating, setUserRating] = useState(0);

  useEffect(() => {
    if (!id) return;

    // All live IDs come from TMDB — fetch from our API route
    fetch(`/api/movies/${id}`)
      .then(r => r.json())
      .then((data: Movie & { error?: string }) => {
        setMovie(data.error ? null : data);
      })
      .catch(() => setMovie(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleToggleWatched = () => {
    setIsWatched(prev => !prev);
    toast({ title: isWatched ? 'Removed from watched' : 'Marked as watched' });
  };

  const handleToggleWatchlist = () => {
    setIsInWatchlist(prev => !prev);
    toast({ title: isInWatchlist ? 'Removed from watchlist' : 'Added to watchlist' });
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: 'Link copied!', description: 'Share it with your friends.' });
  };

  if (loading) return <DetailSkeleton />;

  if (!movie) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 pb-32">
      <div className="h-20 w-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Film className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-headline font-bold">Title not found</h1>
        <p className="text-muted-foreground">This movie or show could not be loaded.</p>
      </div>
      <Button variant="outline" className="rounded-full border-white/10" onClick={() => router.back()}>
        <ChevronLeft className="h-4 w-4 mr-2" /> Go Back
      </Button>
    </main>
  );

  return (
    <main className="min-h-screen pb-32 bg-background">
      {/* Backdrop / Trailer area */}
      <section className="relative w-full h-[50vh] bg-black">
        <Image
          src={movie.backdrop}
          alt={movie.title}
          fill
          className="object-cover opacity-60"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-20">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full bg-black/40 backdrop-blur-md border-white/10"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full bg-black/40 backdrop-blur-md border-white/10"
            onClick={handleShare}
          >
            <Share2 className="h-5 w-5" />
          </Button>
        </header>

        <div className="absolute inset-0 flex items-center justify-center">
          <button className="group flex flex-col items-center gap-4 transition-transform active:scale-95">
            <div className="h-20 w-20 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl group-hover:bg-primary group-hover:scale-110 transition-all">
              <Play className="h-10 w-10 fill-current ml-1" />
            </div>
            <span className="text-sm font-bold tracking-widest uppercase text-white/80 group-hover:text-white">
              Watch Trailer
            </span>
          </button>
        </div>
      </section>

      <div className="px-6 space-y-12">
        {/* Poster & Overview */}
        <section className="flex flex-col md:flex-row gap-8 -mt-20 relative z-10">
          <div className="shrink-0 mx-auto md:mx-0">
            <div className="relative aspect-[2/3] w-48 md:w-64 rounded-[2rem] overflow-hidden shadow-2xl border-4 border-background ring-1 ring-white/10">
              <Image src={movie.poster} alt={movie.title} fill className="object-cover" />
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-end gap-4">
            <h1 className="text-4xl md:text-6xl font-headline font-bold">{movie.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" /> {movie.year}
              </span>
              <span className="flex items-center gap-1.5">
                <Film className="h-4 w-4 text-primary" /> {movie.genre}
              </span>
              {movie.director && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" /> Dir. {movie.director}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-headline font-bold flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" /> Overview
              </h3>
              <p className="text-gray-300 leading-relaxed font-medium text-base">
                {movie.description}
              </p>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="flex flex-wrap gap-4">
          <Button
            variant={isInWatchlist ? 'default' : 'outline'}
            className={`h-14 px-8 rounded-2xl font-bold flex-1 md:flex-none text-base transition-all ${isInWatchlist ? 'bg-primary border-primary' : 'border-white/10 bg-white/5'}`}
            onClick={handleToggleWatchlist}
          >
            {isInWatchlist ? <Check className="h-5 w-5 mr-2" /> : <Plus className="h-5 w-5 mr-2" />}
            {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
          </Button>
          <Button
            variant={isWatched ? 'default' : 'outline'}
            className={`h-14 px-8 rounded-2xl font-bold flex-1 md:flex-none text-base transition-all ${isWatched ? 'bg-accent border-accent' : 'border-white/10 bg-white/5'}`}
            onClick={handleToggleWatched}
          >
            {isWatched ? <Check className="h-5 w-5 mr-2" /> : <Play className="h-5 w-5 mr-2" />}
            {isWatched ? 'Watched' : 'Mark Watched'}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-14 px-8 rounded-2xl border-white/10 bg-white/5 font-bold flex-1 md:flex-none text-base">
                <ListPlus className="h-5 w-5 mr-2" /> Add to List
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-headline">Add to Custom List</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-4">
                <Button variant="ghost" className="w-full justify-start h-14 rounded-2xl" onClick={() => toast({ title: 'Added to Sci-Fi Classics' })}>
                  <Film className="h-5 w-5 mr-3 text-primary" /> Sci-Fi Classics
                </Button>
                <Button variant="ghost" className="w-full justify-start h-14 rounded-2xl" onClick={() => toast({ title: 'Added to Best of 2024' })}>
                  <Star className="h-5 w-5 mr-3 text-accent" /> Best of 2024
                </Button>
                <Separator className="bg-white/5 my-2" />
                <Button className="w-full h-12 rounded-2xl" variant="outline">
                  <Plus className="h-4 w-4 mr-2" /> Create New List
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </section>

        {/* Ratings */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white/5 p-8 rounded-[2.5rem] border border-white/5">
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Global Rating</h3>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-black font-headline text-accent">{movie.rating.toFixed(1)}</div>
              <div className="space-y-1">
                <div className="flex gap-0.5">
                  {Array(5).fill(0).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 fill-current ${i < Math.floor(movie.rating / 2) ? 'text-accent' : 'text-white/10'}`} />
                  ))}
                </div>
                <div className="text-xs text-muted-foreground font-bold">{movie.votes.toLocaleString()} ratings</div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Rate This</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                  <button
                    key={i}
                    onClick={() => {
                      setUserRating(i);
                      toast({ title: `You rated it ${i}/10!` });
                    }}
                    className="transition-all hover:scale-125 active:scale-90 p-1"
                  >
                    <Star className={`h-6 w-6 transition-colors ${userRating >= i ? 'fill-accent text-accent' : 'text-white/10 hover:text-white/40'}`} />
                  </button>
                ))}
              </div>
              <p className="text-xs font-bold text-accent">
                {userRating > 0 ? `Your score: ${userRating}/10` : 'Select a star to rate'}
              </p>
            </div>
          </div>
        </section>

        {/* Cast */}
        {movie.cast.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-2xl font-headline font-bold">Cast & Crew</h3>
            <div className="bg-white/5 rounded-3xl p-8 border border-white/5 space-y-6">
              {movie.director && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Director</span>
                  <span className="text-xl font-bold font-headline">{movie.director}</span>
                </div>
              )}
              <ScrollArea className="w-full">
                <div className="flex gap-6 pb-4">
                  {movie.cast.map(actor => <PersonCard key={actor.id} actor={actor} />)}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          </section>
        )}

        {/* Reviews */}
        {movie.reviews.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-headline font-bold">Community Reviews</h3>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="link" className="text-primary font-bold">Read All {movie.reviews.length}</Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl rounded-[2.5rem] max-h-[80vh] p-0 overflow-hidden border-white/10">
                  <DialogHeader className="p-8 pb-4">
                    <DialogTitle className="font-headline text-3xl">All Reviews</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="h-full px-8 pb-8">
                    <div className="space-y-8 pt-4">
                      {movie.reviews.map(r => (
                        <div key={r.id} className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10"><AvatarImage src={r.userAvatar} /></Avatar>
                              <div>
                                <span className="text-sm font-bold font-headline block">{r.userName}</span>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{r.date}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 bg-accent/20 text-accent px-3 py-1.5 rounded-full text-xs font-black">
                              <Star className="h-3 w-3 fill-current" /> {r.rating}
                            </div>
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed italic">&ldquo;{r.content}&rdquo;</p>
                          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{r.likes} people found this helpful</div>
                          <Separator className="bg-white/5 mt-4" />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {movie.reviews.slice(0, 2).map(r => (
                <div key={r.id} className="bg-white/5 p-8 rounded-3xl border border-white/5 space-y-4 hover:bg-white/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10"><AvatarImage src={r.userAvatar} /></Avatar>
                      <div>
                        <span className="text-sm font-bold font-headline block">{r.userName}</span>
                        <span className="text-[10px] text-muted-foreground font-bold">{r.date}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-accent/20 text-accent px-3 py-1 rounded-full text-xs font-black">
                      <Star className="h-3 w-3 fill-current" /> {r.rating}
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 line-clamp-3 italic leading-relaxed">&ldquo;{r.content}&rdquo;</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quotes & Trivia */}
        {(movie.quotes.length > 0 || movie.trivia.length > 0) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {movie.quotes.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
                  <Quote className="h-6 w-6 text-primary" /> Iconic Quotes
                </h3>
                <div className="space-y-4">
                  {movie.quotes.map((q, i) => (
                    <div key={i} className="p-6 bg-white/5 rounded-3xl border-l-4 border-primary italic text-base text-gray-300 shadow-lg">
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {movie.trivia.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
                  <Award className="h-6 w-6 text-accent" /> Did You Know?
                </h3>
                <div className="space-y-4">
                  {movie.trivia.map((t, i) => (
                    <div key={i} className="p-6 bg-white/5 rounded-3xl text-base text-gray-300 flex items-start gap-4 shadow-lg border border-white/5">
                      <div className="h-3 w-3 rounded-full bg-accent shrink-0 mt-1.5 ring-4 ring-accent/20" />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
