import { ImageResponse } from 'next/og';
import { BRAND_GRADIENT, BRAND_MONOGRAM } from '@/lib/brand';

// Standalone forecastfeed logo, sized for use as an Instagram profile
// picture (IG crops any square upload to a circle, so this fills a
// transparent square with the same gradient badge used on every card).
export const dynamic = 'force-dynamic';

const SIZE = 1080;

// Satori needs raw font data; fetch once and reuse across renders.
let fontPromise: Promise<ArrayBuffer> | null = null;
function loadFont() {
  fontPromise ??= fetch(
    'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5/files/montserrat-latin-800-normal.woff',
  ).then(async (res) => {
    if (!res.ok) throw new Error('Failed to download font');
    return res.arrayBuffer();
  });
  return fontPromise;
}

export async function GET() {
  const font = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 920,
            height: 920,
            borderRadius: 999,
            background: BRAND_GRADIENT,
            color: '#ffffff',
            textShadow: '0 4px 16px rgba(0,0,0,0.45)',
            fontFamily: 'Montserrat',
            fontSize: 340,
            fontWeight: 800,
            letterSpacing: 8,
          }}
        >
          {BRAND_MONOGRAM}
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      fonts: [{ name: 'Montserrat', data: font, weight: 800, style: 'normal' }],
    },
  );
}
