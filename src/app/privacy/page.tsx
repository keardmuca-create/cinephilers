import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Cinephilers',
  description: 'Privacy Policy for Cinephilers — how we collect, use, and protect your data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <Link href="/" className="p-2 rounded-full hover:bg-muted/50 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-headline font-bold">Privacy Policy</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-8">Last updated: August 2026</p>

        <div className="space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">1. Who we are</h2>
            <p>
              Cinephilers (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the app&rdquo;) is an independent movie and TV tracking service available at cinephilers.app.
              If you have any questions about this policy, contact us at{' '}
              <a href="mailto:support@cinephilers.app" className="text-primary hover:underline">support@cinephilers.app</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">2. What data we collect</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-foreground">Account data:</strong> email address, username, display name, and password (stored as a hashed value — we never store your plain-text password).</li>
              <li><strong className="text-foreground">Profile data:</strong> avatar image, bio, and any preferences you choose to set.</li>
              <li><strong className="text-foreground">Activity data:</strong> movies and shows you mark as watched, ratings, reviews, watchlist entries, and custom lists.</li>
              <li><strong className="text-foreground">Social data:</strong> follow relationships, comments, likes, and notifications.</li>
              <li><strong className="text-foreground">Usage data:</strong> basic server logs (IP address, request timestamps) used for security and debugging. We do not build advertising profiles.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">3. How we use your data</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>To provide and operate the Cinephilers service.</li>
              <li>To send account-related emails (email verification, password reset).</li>
              <li>To display your activity to people who follow you (based on your privacy settings).</li>
              <li>To improve the app and fix bugs.</li>
            </ul>
            <p className="mt-3">We do not sell your data. We do not use your data for advertising.</p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">4. Third-party services</h2>
            <p>
              We use the <strong className="text-foreground">TMDB API</strong> (The Movie Database) to fetch movie and TV data. When you browse or search for titles,
              requests are made to TMDB on your behalf. See{' '}
              <a href="https://www.themoviedb.org/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">TMDB&apos;s Privacy Policy</a>.
            </p>
            <p className="mt-3">
              We use <strong className="text-foreground">Neon</strong> (PostgreSQL) for database hosting. Your data is stored on servers in the EU (Frankfurt).
            </p>
            <p className="mt-3">
              We also rely on a small number of infrastructure providers to run the service:{' '}
              <strong className="text-foreground">Vercel</strong> (application hosting, server logs, and cookieless visitor analytics — aggregated page-view counts with no cookies and no cross-site tracking),{' '}
              <strong className="text-foreground">Resend</strong> (sends account emails such as verification and password reset — they process your email address),{' '}
              <strong className="text-foreground">Upstash</strong> (short-lived rate-limit counters keyed by IP address, expiring within minutes), and{' '}
              <strong className="text-foreground">Sentry</strong> (error monitoring, which may include technical request details when something breaks).
              None of these providers use your data for anything other than operating Cinephilers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">5. Storage on your device</h2>
            <p>
              Cinephilers keeps a copy of your own library — your watchlist, ratings, watch history, and the film details
              needed to display them — in your browser&rsquo;s local storage. This is what lets your lists appear instantly
              instead of being fetched every time, and it is only ever your own data. It is never used to track you, and it is
              never shared with anyone.
            </p>
            <p className="mt-3">
              We also set two cookies, <strong className="text-foreground">access_token</strong> and{' '}
              <strong className="text-foreground">refresh_token</strong>, which are what keep you signed in. They are strictly
              necessary for the service to work, so we do not ask for consent to set them. We use no advertising cookies and no
              tracking cookies of any kind.
            </p>
            <p className="mt-3">
              Clearing your browser data removes this local copy. Nothing is lost — your account data lives on our servers and
              comes back the next time you sign in. You can also sign out, which deletes the cookies immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">6. Data retention</h2>
            <p>
              Your data is kept for as long as your account exists. If you delete your account, your personal data, activity, and reviews will be permanently deleted.
              Contact us at <a href="mailto:support@cinephilers.app" className="text-primary hover:underline">support@cinephilers.app</a> to request account deletion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">7. Your rights</h2>
            <p>You have the right to:</p>
            <ul className="space-y-2 list-disc list-inside mt-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your account and data.</li>
              <li>Set your account to private, which hides your activity from non-followers.</li>
            </ul>
            <p className="mt-3">To exercise these rights, email us at <a href="mailto:support@cinephilers.app" className="text-primary hover:underline">support@cinephilers.app</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">8. Security</h2>
            <p>
              Passwords are hashed using bcrypt. All connections are encrypted via HTTPS. We apply rate limiting to sensitive endpoints (login, password reset) to protect against brute-force attacks.
              No system is perfectly secure — if you discover a vulnerability, please report it to us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">9. Children</h2>
            <p>
              Cinephilers is not intended for users under the age of 13. We do not knowingly collect data from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">10. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. Significant changes will be communicated via email or an in-app notice. The date at the top of this page shows when it was last updated.
            </p>
          </section>

        </div>

        {/* Footer links */}
        <footer className="pt-8 mt-10 border-t border-border flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        </footer>
      </div>
    </main>
  );
}
