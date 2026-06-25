
"use client"

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Home, Search as SearchIcon, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

export const BottomNav = () => {
  const pathname = usePathname();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  // Fetch once on mount + every 60s — not on every navigation
  useEffect(() => {
    if (!user) return;
    let interval: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        const res = await fetchWithAuth('/api/notifications');
        if (res.ok) {
          const json = await res.json();
          setUnread(json.data?.unreadCount ?? 0);
        } else if (res.status === 401) {
          // Refresh failed — session is dead. Stop polling; the auth context
          // handles logout and we'll resume on the next mount.
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    };
    check();
    interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  // Clear dot when visiting social page
  useEffect(() => {
    if (pathname === '/social') setUnread(0);
  }, [pathname]);

  const navItems = [
    { label: 'Home', icon: Home, href: '/home' },
    { label: 'Search', icon: SearchIcon, href: '/browse' },
    { label: 'Social', icon: Users, href: '/social' },
    { label: 'Profile', icon: User, href: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border pb-safe">
      {/* TMDB Attribution */}
      <div className="flex items-center justify-center gap-2 py-1 border-b border-border">
        <Image src="/tmdb-logo.svg" alt="TMDB Logo" width={40} height={8} className="opacity-60" />
        <p className="text-[9px] text-muted-foreground/60 leading-tight">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center flex-1 h-full group"
            >
              <div className={cn(
                "flex flex-col items-center gap-1 px-5 py-2 rounded-2xl transition-all duration-300",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}>
                <div className="relative">
                  <item.icon className={cn(
                    "h-5 w-5 transition-transform duration-300 group-active:scale-90",
                    isActive && "scale-110"
                  )} />
                  {item.href === '/social' && unread > 0 && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-destructive rounded-full" />
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-wide uppercase">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
