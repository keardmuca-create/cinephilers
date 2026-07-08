"use client"

import React, { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Chromium fires this before showing its native install UI; capturing it lets
// our Install button trigger that dialog on demand.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === 'true') return;
    } catch { /* ignore */ }

    // Already running as an installed app — never advertise installing.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // iOS has no install API at all: every browser there (Safari, Chrome,
    // Firefox — all WebKit) installs via Safari's Share sheet, so we show a
    // short guide instead of a button-triggered dialog.
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIsIOS(true);
      setHidden(false);
      return;
    }

    // Chromium (Android Chrome/Samsung/Edge + desktop Chrome/Edge): only show
    // once the browser says the app is installable. Browsers that never fire
    // this (desktop Firefox/Safari) simply never see the banner.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => setHidden(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (isIOS) { setShowIOSGuide(true); return; }
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') dismiss();
  };

  if (hidden) return null;

  return (
    <div className="px-6 pt-6 -mb-4">
      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 max-w-3xl mx-auto relative">
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {showIOSGuide ? (
          <div className="space-y-3 pr-6">
            <p className="font-bold text-base">Add Cinephilers to your Home Screen</p>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="font-bold text-foreground">1.</span>
                Tap the <Share className="h-4 w-4 inline text-primary" /> <span className="font-semibold text-foreground">Share</span> button in Safari
              </li>
              <li className="flex items-center gap-2">
                <span className="font-bold text-foreground">2.</span>
                Choose <SquarePlus className="h-4 w-4 inline text-primary" /> <span className="font-semibold text-foreground">Add to Home Screen</span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">It opens full-screen — just like an app.</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pr-6">
            <div className="space-y-1 flex-1">
              <p className="font-bold text-base">Install Cinephilers</p>
              <p className="text-sm text-muted-foreground">Add it to your home screen — faster, full-screen, feels like a real app.</p>
            </div>
            <Button size="sm" onClick={install} className="rounded-xl font-bold shrink-0 self-start sm:self-auto">
              <Download className="h-4 w-4 mr-2" /> Install
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
