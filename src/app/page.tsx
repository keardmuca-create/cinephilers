import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Play, Star, ListPlus, Users, Upload, Award, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { siteStructuredData } from '@/lib/structured-data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const FEATURES = [
  { icon: Play, title: 'Track everything', text: 'Mark movies, shows, and individual episodes as watched. Your full viewing history, in one place.' },
  { icon: Star, title: 'Rate & review', text: 'Score everything out of 10 and write reviews. See your taste mapped out in stats and charts.' },
  { icon: ListPlus, title: 'Watchlist & lists', text: 'Save what you want to watch next and build custom lists for any mood, genre, or marathon.' },
  { icon: Users, title: 'Follow friends', text: 'See what your friends watch, rate, and review in a live activity feed. Compare ratings on every title.' },
  { icon: Upload, title: 'Import your history', text: 'Bring your Letterboxd or IMDb data with you in one click. No starting from zero.' },
  // Named badges that actually exist in badge-defs.ts. This said "seasonal
  // challenges" for months — seasonal badges were considered and deliberately not
  // built, so the page was sending new members looking for something that was
  // never there.
  { icon: Award, title: 'Earn badges', text: 'Unlock badges for milestones, world cinema, episodes, reviews, and your daily pick streak.' },
];

// The landing page's Today's Pick band is a still life of the real thing: the
// same poster wall, the same card, the same 2:3 window — but rendered on the
// server with nothing behind it, because the live component needs an account and
// a watchlist before it has anything to say.
//
// It shows the state BEFORE Generate on purpose. Showing a revealed film would
// mean naming a pick nobody made, and the reveal is the part worth signing up
// for; giving it away on the way in spends it.
// Eight across and eight down, same as the app's wall. The first version ran 32
// tiles — four rows — and stopped short of the card's bottom edge, leaving a bare
// pink strip. A wall clipped by the frame reads as a wall continuing behind the
// card; one that runs out reads as a mistake. The overshoot is a few kilobytes of
// w92 thumbnails.
const WALL_COLS = 8;

// A FIXED wall, not one built from the home pool.
//
// The pool is "popular this week", so the landing page's backdrop changed with
// whatever was trending — which is how Minions and a Punisher sequel ended up
// standing in for cinema on the front page. It also made the first impression
// unrepeatable: no two visitors, and no two days, saw the same page.
//
// These sixty-four are chosen once and stay. The twelve Keard picked by name for
// the app's own wall lead, then films that are recognisable on sight almost
// anywhere. Paths were read from the live app's own meta and top-rated responses,
// so every one resolves to real artwork rather than being typed from memory.
//
// TMDB serves the images; nothing here is stored or re-hosted. If a path ever
// 404s the tile is simply blank behind a card, which is why this can be a plain
// list rather than something that needs fetching and caching.
const WALL_POSTERS = [
  // The twelve pinned for the app's wall — same films, same order.
  '/1GuK965FLJxqUw9fd1pmvjbFAlv.jpg', // Sleepy Hollow
  '/poHwCZeWzJCShH7tOjg8RIoyjcw.jpg', // Pirates of the Caribbean
  '/fDPAjvfPMomkKF7cMRmL5Anak61.jpg', // Meet Joe Black
  '/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg', // Dune
  '/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg', // Dune: Part Two
  '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', // The Godfather
  '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', // The Shawshank Redemption
  '/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg', // Breaking Bad
  '/37sTgAG9QardbdzCq51FoUw1Ijb.jpg', // Game of Thrones
  '/nrmXQ0zcZUL8jFLrakWc90IR8z9.jpg', // Shutter Island
  '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', // Titanic
  '/sYgimsiBywqVwJI8H4sETke8m7v.jpg', // Identity
  // The rest.
  '/sSuQTCZwqKrNBNIsksO9IAUoWP9.jpg', // The Godfather Part II
  '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', // Schindler's List
  '/ppd84D2i9W8jXmsyInGyihiSyqz.jpg', // 12 Angry Men
  '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', // The Dark Knight
  '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', // Spirited Away
  '/8VG8fDNiy50H4FedGwdSVUPoaJe.jpg', // The Green Mile
  '/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg', // LOTR: The Return of the King
  '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', // Parasite
  '/vfJFJPepRKapMd5G2ro7klIRysq.jpg', // Your Name.
  '/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg', // Interstellar
  '/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg', // Pulp Fiction
  '/bX2xnavhMYjWDoZp1VM6VnU1xwe.jpg', // The Good, the Bad and the Ugly
  '/Cw4hIUIAmSYfK9QfaUW5igp9La.jpg',  // Forrest Gump
  '/zK7HsOC7QxW1ldKIeFG8YJ5F2Eb.jpg', // Harakiri
  '/lOMGc8bnSwQhS4XyE1S99uH8NXf.jpg', // Seven Samurai
  '/9OkCLM73MIU2CrKZbqiT8Ln1wY2.jpg', // GoodFellas
  '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg', // Grave of the Fireflies
  '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', // LOTR: The Fellowship of the Ring
  '/74hLDKjD5aGYOotO6esUVaeISa2.jpg', // Life Is Beautiful
  '/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg', // Fight Club
  '/9JhfVOveaY00o8njQu2Xrp4YWud.jpg', // Cinema Paradiso
  '/k7eYdWvhYQyRQoU2TB2A2Xu2TfD.jpg', // City of God
  '/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg', // LOTR: The Two Towers
  '/yz4QVqPx3h1hD1DfqqQkCq3rmxW.jpg', // Psycho
  '/kjWsMh72V6d8KRLV4EOoSJLT1H7.jpg', // One Flew Over the Cuckoo's Nest
  '/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg', // Spider-Man: Into the Spider-Verse
  '/tuFaWiqX0TXoWu7DGNcmX3UW7sT.jpg', // A Silent Voice
  '/nNAeTmF4CtdSgMDplXTDPOpYzsX.jpg', // The Empire Strikes Back
  '/13kOl2v0nD2OLbVSHnHk8GUFEhO.jpg', // Howl's Moving Castle
  '/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg', // Se7en
  '/tgNjemQPG96uIezpiUiXFcer5ga.jpg', // High and Low
  '/7fn624j5lj3xTme2SgiLCeuedmO.jpg', // Whiplash
  '/i0enkzsL5dPeneWnjl1fCWm6L7k.jpg', // Once Upon a Time in America
  '/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg', // Inception
  '/2hFvxCCWrTmCYwfy7yum0GKRi3Y.jpg', // The Pianist
  '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', // Spider-Man: Across the Spider-Verse
  '/uS9m8OBk1A8eM9I042bx8XXpqAq.jpg', // The Silence of the Lambs
  '/ILVF0eJxHMddjxeQhswFtpMtqx.jpg',  // Rear Window
  '/vN5B5WgYscRGcQpVhHl6p9DDTP0.jpg', // Back to the Future
  '/x2drgoXYZ8484lqyDj7L1CEVR4T.jpg', // American History X
  '/cMYCDADoLKLbB83g4WnJegaZimC.jpg', // Princess Mononoke
  '/dgNTS4EQDDVfkzJI5msKuHu2Ei3.jpg', // Ikiru
  '/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg', // The Wild Robot
  '/6WTiOCfDPP8XV4jqfloiVWf7KHq.jpg', // Perfect Blue
  '/tNvKkSnnn4Z6RCBThyK1gfCSSvv.jpg', // Dead Poets Society
  '/bxB2q91nKYp8JNzqE7t7TWBVupB.jpg', // Léon: The Professional
  '/nhMXB8GTdswYMCL9nepDZymJCOr.jpg', // The Great Dictator
  '/7uoiKOEjxBBW0AgDGQWrlfGQ90w.jpg', // Modern Times
  '/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg', // The Matrix
  '/uAR0AWqhQL1hQa69UDEbb2rE5Wx.jpg', // The Shining
  '/wN2xWp1eIwCKOD0BHTcErTBv1Uq.jpg', // Gladiator
  '/Ag2B2KHKQPukjH7WutmgnnSNurZ.jpg', // The Prestige
];

export default async function RootPage() {
  const jar = await cookies();
  if (jar.get('access_token')?.value || jar.get('refresh_token')?.value) redirect('/home');

  // The CSP allows scripts by nonce only, so the schema block needs the same
  // per-request nonce the middleware issues — without it the browser drops it and
  // the markup silently never ships.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Fixed for the same reason the Today's Pick wall below is fixed: the live
  // pool is "popular this week", so whatever happened to be trending stood in
  // for cinema behind the headline. Eighteen of the same sixty-four, which is
  // three rows of six on desktop and six of three on a phone.
  const heroPosters = WALL_POSTERS.slice(0, 18);

  return (
    <main className="min-h-screen bg-background">
      {/* Who we are and what the app does, stated outright rather than left to be
          inferred from the prose below. See src/lib/structured-data.ts. */}
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData()) }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Poster wall */}
        <div className="absolute inset-0 grid grid-cols-3 sm:grid-cols-6 gap-2 p-2 opacity-30 scale-105 -rotate-1">
          {heroPosters.map(path => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={path}
              src={`https://image.tmdb.org/t/p/w342${path}`}
              alt=""
              className="w-full aspect-[2/3] object-cover rounded-xl"
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />

        <div className="relative z-10 max-w-3xl mx-auto px-6 pt-28 pb-24 text-center space-y-6">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-primary">Cinephilers</p>
          <h1 className="text-4xl sm:text-6xl font-headline font-black leading-tight">
            Every film you watch,<br className="hidden sm:block" /> remembered.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Track movies and shows, rate and review them, build your watchlist, and see what your friends are watching.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button asChild size="lg" className="rounded-2xl h-14 px-8 font-bold text-base">
              <Link href="/signup">Sign Up</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-2xl h-14 px-8 font-bold text-base border-2 border-foreground">
              <Link href="/home">Explore First</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Already a member?{' '}
            <Link href="/login" className="text-primary hover:underline font-semibold">Log in</Link>
          </p>
        </div>
      </section>

      {/* Today's Pick */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Today&apos;s Pick</p>
            <h2 className="text-3xl sm:text-4xl font-headline font-black leading-tight">
              One film a day,<br className="hidden sm:block" /> out of your own watchlist.
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Not a film of the day everybody gets. Yours — drawn from the list you built,
              one film, once a day. Press it and the reel spins through your watchlist until
              it lands on tonight.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2.5">
                <span className="text-primary font-bold">·</span>
                Locked until midnight, so there is no rerolling until you like the answer.
              </li>
              <li className="flex gap-2.5">
                <span className="text-primary font-bold">·</span>
                Mark it watched and it counts — towards your history, your stats, and a streak badge.
              </li>
              <li className="flex gap-2.5">
                <span className="text-primary font-bold">·</span>
                Tells you why it picked that one, and what your friends made of it.
              </li>
            </ul>
          </div>

          {/* The still life. Same shell, wall and card as the real component. */}
          <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 px-8 py-9 sm:px-10 sm:py-10">
            <div aria-hidden className="absolute inset-0 pointer-events-none select-none">
              <div
                className="absolute inset-x-0 top-0 grid"
                style={{ gridTemplateColumns: `repeat(${WALL_COLS}, 1fr)` }}
              >
                {WALL_POSTERS.map(p => (
                  <div key={p} className="relative aspect-[2/3]">
                    {/* w92, TMDB's smallest. Each tile is an eighth of the card's
                        width and these are served unoptimised, so the size named
                        in the URL is the size downloaded. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://image.tmdb.org/t/p/w92${p}`}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
              {/* Barely tinted, same as the app: enough to stop sixty-four
                  unrelated palettes clashing, not enough to hide the posters. */}
              <div className="absolute inset-0 bg-primary/20 mix-blend-color" />
            </div>

            <div className="relative mx-auto max-w-xs rounded-[1.6rem] bg-card border border-border/60 shadow-2xl p-5 flex flex-col items-center justify-center text-center gap-3">
              <div className="relative w-20 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="w-full h-[7.5rem] flex flex-col items-center justify-center gap-1 overflow-hidden">
                <h3 className="text-xl font-headline font-bold leading-tight">Today&apos;s Pick</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  Choosing is the hard part. We&apos;ll handle that bit.
                </p>
              </div>
              {/* Same pill, same height as the real Generate button, but it says
                  what it does. Labelling it "Generate" would look right and then
                  hand a stranger a signup form instead of a film. */}
              <Button asChild className="w-full rounded-full h-12 font-bold text-base">
                <Link href="/signup"><Sparkles className="h-5 w-5 mr-2" /> Create free account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-card border border-border rounded-3xl p-6 space-y-3">
              <div className="h-11 w-11 rounded-2xl bg-primary/15 flex items-center justify-center">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-headline font-bold text-lg">{f.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-3xl mx-auto px-6 pb-20 text-center space-y-5">
        <h2 className="text-2xl sm:text-3xl font-headline font-bold">Start your watch history today</h2>
        <Button asChild size="lg" className="rounded-2xl h-14 px-10 font-bold text-base">
          <Link href="/signup">Create Free Account</Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-5">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          </div>
          <p>
            Data from{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">TMDB</a>
            {' '}— not endorsed or certified by TMDB.
          </p>
        </div>
      </footer>
    </main>
  );
}
