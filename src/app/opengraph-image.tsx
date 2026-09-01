import { ImageResponse } from 'next/og';

// Site-wide link preview card. Film and profile pages override this with their
// own poster/avatar (see movie/[id]/layout.tsx); this is what every other URL —
// including the homepage we link from Product Hunt, Reddit and AlternativeTo —
// falls back to. Next also emits this as twitter:image.
export const alt = 'Cinephilers — one film a day, chosen from your own watchlist';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// hsl(348 83% 47%), the --primary token in globals.css
const BRAND = '#DB1440';
const INK = '#141414';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: BRAND,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 38,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ marginLeft: 22, fontSize: 40, fontWeight: 700, color: INK }}>
            Cinephilers
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            One film a day, chosen
          </div>
          <div
            style={{
              fontSize: 82,
              fontWeight: 700,
              color: BRAND,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            from your own watchlist
          </div>
          <div style={{ marginTop: 28, fontSize: 34, color: '#5a5a5a', lineHeight: 1.35 }}>
            Track films and TV, episode by episode. Rate, review and
          </div>
          <div style={{ fontSize: 34, color: '#5a5a5a', lineHeight: 1.35 }}>
            follow friends. Free, no ads.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 64, height: 6, borderRadius: 3, background: BRAND }} />
          <div style={{ marginLeft: 20, fontSize: 30, color: '#8a8a8a' }}>cinephilers.app</div>
        </div>
      </div>
    ),
    size,
  );
}
