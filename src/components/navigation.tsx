
"use client"

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search as SearchIcon, History as HistoryIcon, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export const BottomNav = () => {
  const pathname = usePathname();

  const navItems = [
    { label: 'Home', icon: Home, href: '/home' },
    { label: 'Search', icon: SearchIcon, href: '/browse' },
    { label: 'History', icon: HistoryIcon, href: '/history' },
    { label: 'Profile', icon: User, href: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-white/5 pb-safe">
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
                <item.icon className={cn(
                  "h-5 w-5 transition-transform duration-300 group-active:scale-90",
                  isActive && "scale-110"
                )} />
                <span className="text-[10px] font-medium tracking-wide uppercase">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
