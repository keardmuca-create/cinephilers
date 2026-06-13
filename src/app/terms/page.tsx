import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Cinephilers',
  description: 'Terms of Service for Cinephilers — the rules for using the platform.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <Link href="/" className="p-2 rounded-full hover:bg-muted/50 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-headline font-bold">Terms of Service</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-8">Last updated: June 2026</p>

        <div className="space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">1. Acceptance</h2>
            <p>
              By creating an account or using Cinephilers (&ldquo;the service&rdquo;, &ldquo;the app&rdquo;), you agree to these Terms of Service.
              If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">2. Eligibility</h2>
            <p>
              You must be at least 13 years old to use Cinephilers. By using the service, you represent that you meet this requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">3. Your account</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>You are responsible for keeping your password secure.</li>
              <li>You may not share your account with others or create multiple accounts to evade restrictions.</li>
              <li>You must provide accurate information when signing up.</li>
              <li>Notify us immediately at <a href="mailto:support@cinephilers.app" className="text-primary hover:underline">support@cinephilers.app</a> if you believe your account has been compromised.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">4. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="space-y-2 list-disc list-inside mt-2">
              <li>Post content that is abusive, harassing, hateful, or defamatory.</li>
              <li>Post spam, advertisements, or automated content.</li>
              <li>Attempt to access other users&apos; accounts or data.</li>
              <li>Scrape or bulk-download data from the service.</li>
              <li>Use the service in any way that violates applicable law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">5. User content</h2>
            <p>
              You retain ownership of reviews, ratings, and lists you create. By posting content, you grant Cinephilers a non-exclusive licence to display that content as part of the service.
              We reserve the right to remove content that violates these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">6. Third-party content</h2>
            <p>
              Movie and TV information is sourced from the TMDB API. This product uses the TMDB API but is not endorsed or certified by TMDB.
              We are not responsible for the accuracy of third-party data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">7. Service availability</h2>
            <p>
              We aim to keep Cinephilers available at all times but cannot guarantee uninterrupted access.
              We may modify, suspend, or discontinue the service at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">8. Disclaimer of warranties</h2>
            <p>
              Cinephilers is provided &ldquo;as is&rdquo; without warranties of any kind. We do not guarantee that the service will be error-free or that any data will be preserved indefinitely.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">9. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Cinephilers shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">10. Termination</h2>
            <p>
              We may suspend or terminate your account if you violate these terms. You may delete your account at any time by contacting us at{' '}
              <a href="mailto:support@cinephilers.app" className="text-primary hover:underline">support@cinephilers.app</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">11. Changes to these terms</h2>
            <p>
              We may update these terms from time to time. Continued use of the service after changes are posted constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-headline font-bold text-foreground mb-3">12. Contact</h2>
            <p>
              Questions about these terms? Email us at{' '}
              <a href="mailto:support@cinephilers.app" className="text-primary hover:underline">support@cinephilers.app</a>.
            </p>
          </section>

        </div>

        {/* Footer links */}
        <footer className="pt-8 mt-10 border-t border-border flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        </footer>
      </div>
    </main>
  );
}
