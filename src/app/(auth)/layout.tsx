import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-headline font-bold text-foreground">Cinephilers</h1>
          <p className="text-muted-foreground text-sm mt-1">Track. Rate. Discover.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
