import Link from 'next/link';
import { Film } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
        <Film className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-6xl font-headline font-black text-primary mb-2">404</h1>
      <h2 className="text-2xl font-headline font-bold mb-4">Page not found</h2>
      <p className="text-muted-foreground mb-8 max-w-sm">
        This page doesn&apos;t exist or was moved. Head back and keep watching.
      </p>
      <div className="flex gap-3">
        <Link
          href="/home"
          className="bg-primary text-white font-bold px-6 py-3 rounded-full hover:bg-primary/90 transition-colors text-sm"
        >
          Go home
        </Link>
        <Link
          href="/"
          className="border border-white/20 text-foreground font-bold px-6 py-3 rounded-full hover:bg-white/5 transition-colors text-sm"
        >
          Landing page
        </Link>
      </div>
    </main>
  );
}
