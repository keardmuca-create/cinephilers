import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The profile page's See All links are plain anchors on purpose. iOS freezes a PWA
// in the background and kills its in-flight requests; the Next router can come back
// with a navigation that never resolves, and <Link> calls preventDefault, so a tap
// is swallowed with no navigation and no error. A real browser navigation cannot be
// swallowed, which makes these the way off a stuck page.
//
// This is exactly the kind of thing a later tidy-up turns back into <Link> for
// consistency, so it is asserted rather than only commented.

const root = join(__dirname, '..', '..');
const profile = readFileSync(join(root, 'src', 'app', '(main)', 'profile', 'page.tsx'), 'utf8');
const timeout = readFileSync(join(root, 'src', 'lib', 'fetch-timeout.ts'), 'utf8');
const withAuth = readFileSync(join(root, 'src', 'lib', 'fetch-with-auth.ts'), 'utf8');
const authContext = readFileSync(join(root, 'src', 'contexts', 'auth-context.tsx'), 'utf8');

const SEE_ALL = 'See All <ChevronRight className="h-3 w-3" />';

describe('profile See All links survive a wedged router', () => {
  it('has See All links to find', () => {
    expect(profile.split(SEE_ALL).length - 1).toBeGreaterThan(0);
  });

  it('opens every one of them with a plain anchor, never <Link>', () => {
    const parts = profile.split(SEE_ALL);
    // Every chunk before a See All must have <a as its last unclosed opening tag.
    for (const chunk of parts.slice(0, -1)) {
      const lastLink = chunk.lastIndexOf('<Link');
      const lastAnchor = chunk.lastIndexOf('<a');
      expect(lastAnchor).toBeGreaterThan(lastLink);
    }
  });

  it('closes them with </a>', () => {
    const parts = profile.split(SEE_ALL);
    for (const chunk of parts.slice(1)) {
      expect(chunk.trimStart().startsWith('</a>') || chunk.indexOf('</a>') < chunk.indexOf('</Link>') || chunk.indexOf('</Link>') === -1).toBe(true);
    }
  });
});

describe('requests always settle', () => {
  it('has a deadline that is generous but finite', () => {
    const ms = Number(timeout.match(/REQUEST_TIMEOUT_MS = ([\d_]+)/)?.[1].replace(/_/g, ''));
    expect(ms).toBeGreaterThanOrEqual(10_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  it('leaves a caller-supplied signal alone', () => {
    // A search-as-you-type hook aborts deliberately; imposing a second signal on it
    // would fight its own cancellation.
    expect(timeout).toContain('if (init?.signal) return init;');
  });

  it('degrades to old behaviour where AbortSignal.timeout is missing', () => {
    expect(timeout).toContain('HAS_TIMEOUT_SIGNAL');
  });

  it('applies to the authenticated fetch helper', () => {
    expect(withAuth).toContain('withTimeout');
  });

  it('applies to the boot path, which is what leaves the app loading forever', () => {
    // refetch() clears `loading` in a finally. If these never settle, the finally
    // never runs and the whole app sits half-loaded until the tab is closed.
    for (const call of ["'/api/users/me', withTimeout(", "'/api/sync', withTimeout(", "'/api/auth/refresh', withTimeout("]) {
      expect(authContext).toContain(call);
    }
  });
});
