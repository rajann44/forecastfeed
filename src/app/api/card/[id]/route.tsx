import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { BRAND_GRADIENT, BRAND_MONOGRAM } from '@/lib/brand';
import { deriveImageQuery } from '@/lib/imageQuery';
import { fetchStockBackground } from '@/lib/stockPhoto';
import { fetchTweetDetails, type TweetDetails } from '@/lib/tweetDetails';

// Cards are rendered live from the latest tweet data.
export const dynamic = 'force-dynamic';

const WIDTH = 1080;
const HEIGHT = 1350; // 4:5 portrait

// CTA yellow palette — combination shades: deep golden main text, brighter
// yellow for accent words, and a vivid yellow bar topping the headline band.
const YELLOW_MAIN = '#ffc300';
const YELLOW_ACCENT = '#ffee58';
const YELLOW_BAR = '#ffd60a';


// Satori needs raw font data; fetch once and reuse across renders.
let fontsPromise: Promise<{ regular: ArrayBuffer; headline: ArrayBuffer }> | null = null;

// Montserrat: 500 for small footer text, 800 for the headline — the
// ExtraBold weight matches the rounded bold sans in the reference.
function loadFonts() {
  fontsPromise ??= Promise.all([
    fetch('https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5/files/montserrat-latin-500-normal.woff'),
    fetch('https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5/files/montserrat-latin-800-normal.woff'),
  ]).then(async ([regular, headline]) => {
    if (!regular.ok || !headline.ok) throw new Error('Failed to download fonts');
    return {
      regular: await regular.arrayBuffer(),
      headline: await headline.arrayBuffer(),
    };
  });
  return fontsPromise;
}

/** Strip t.co links, collapse whitespace, and cap length for the headline. */
function headlineFromTweet(text: string): string {
  const cleaned = text
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trimEnd()}…` : cleaned;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid tweet ID' }, { status: 400 });
  }

  // Fonts have zero dependency on the tweet — start loading them immediately
  // instead of after everything else, so a cold-start font fetch overlaps
  // with the tweet fetch/gist/stock-photo work below instead of adding on
  // top of it.
  const pendingFonts = loadFonts();

  const tweet = await fetchTweetDetails(id, `https://x.com/i/status/${id}`);
  if (!tweet.ok || !tweet.details) {
    return NextResponse.json(
      { error: tweet.error ?? 'Tweet not found' },
      { status: 502 },
    );
  }

  // ?headline= lets the publish flow render the same viral-rewritten text
  // shown in the Instagram caption. With no override (e.g. the web UI
  // preview), the card shows the original tweet text. Whichever text is
  // actually shown as the headline also drives the image search below, so
  // the background always matches what the card says.
  const query = new URL(request.url).searchParams;
  const headlineOverride = query.get('headline');
  const searchText = headlineOverride ? headlineOverride.trim() : tweet.details.text;
  const headline = headlineOverride ? searchText : headlineFromTweet(tweet.details.text);

  // Backgrounds always come from free stock photos — the tweet's own media
  // is intentionally never used. A short LLM-derived "gist" (what should
  // this photo actually show) is tried first, since plain keyword
  // extraction can surface off-subject images; falls back to keyword search,
  // then the branded gradient if nothing is found. An optional ?gist=
  // lets a caller pass a pre-derived gist to skip this LLM call entirely
  // (not currently used by /api/publish — see its comment for why — but
  // kept available); when absent, it's derived fresh as before.
  const gistHint = query.has('gist') ? query.get('gist') || null : await deriveImageQuery(searchText);
  const stock = await fetchStockBackground(searchText, gistHint);
  const background = stock?.dataUri ?? null;
  const credit = stock?.credit ?? null;

  const fonts = await pendingFonts;

  return new ImageResponse(
    <Card details={tweet.details} headline={headline} background={background} credit={credit} />,
    {
      width: WIDTH,
      height: HEIGHT,
      emoji: 'twemoji',
      fonts: [
        { name: 'Montserrat', data: fonts.regular, weight: 400, style: 'normal' },
        { name: 'Montserrat', data: fonts.headline, weight: 800, style: 'normal' },
      ],
    },
  );
}

// Translucent grey chip behind small overlay text, per the reference style.
const chipStyle = {
  display: 'flex',
  background: 'rgba(90,90,90,0.65)',
  color: 'rgba(255,255,255,0.92)',
  padding: '8px 16px',
  borderRadius: 6,
} as const;

// Same circular-chip shape as before, but colored with the six stripes of
// the classic 1977 Apple rainbow logo — subtle corner branding with a
// recognizable, colorful identity instead of flat grey.
const logoBadgeStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  borderRadius: 999,
  background: BRAND_GRADIENT,
  color: '#ffffff',
  textShadow: '0 1px 3px rgba(0,0,0,0.45)',
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: 1,
} as const;

function Card({
  details,
  headline,
  background,
  credit,
}: {
  details: TweetDetails;
  headline: string;
  background: string | null;
  credit: string | null;
}) {
  const words = headline.split(' ');
  // First few words get the accent color, like the reference design.
  const accentCount = Math.min(4, Math.max(1, Math.floor(words.length / 3)));

  const date = details.createdAt
    ? new Date(details.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        fontFamily: 'Montserrat',
        background: 'linear-gradient(160deg, #0a1428 0%, #12245c 55%, #0b2fa3 100%)',
      }}
    >
      {background ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={background}
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            top: 120,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            fontSize: 110,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.10)',
            letterSpacing: 18,
          }}
        >
          {details.author.handle.toUpperCase()}
        </div>
      )}

      {/* Bottom scrim so the headline block always sits on a readable base */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 620,
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Subtle forecastfeed monogram, top-right corner */}
      <div style={{ position: 'absolute', top: 56, right: 56, display: 'flex' }}>
        <div style={logoBadgeStyle}>{BRAND_MONOGRAM}</div>
      </div>

      {/* Rule + glass headline box, stacked: the line stretches to match the
          box's width via alignItems: stretch (default), staying outside it. */}
      <div
        style={{
          position: 'absolute',
          left: 56,
          bottom: 200,
          maxWidth: 900,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Minimal rule above the box, same width as the box below it */}
        <div style={{ display: 'flex', width: '100%', height: 5, background: YELLOW_BAR, marginBottom: 14 }} />
        <div
          style={{
            // Satori (the card renderer) doesn't support backdrop-filter, so
            // there's no real blur available — this fakes a "smoked glass"
            // panel instead: a dark translucent tint (keeps the yellow text
            // legible against busy backgrounds) plus a light edge border.
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15,17,23,0.46)',
            border: '1px solid rgba(255,255,255,0.20)',
            padding: '32px 40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              fontFamily: 'Montserrat',
              fontSize: 58,
              fontWeight: 800,
              lineHeight: 1.35,
            }}
          >
            {words.map((word, i) => (
              <span
                key={`${i}-${word}`}
                style={{
                  color: i < accentCount ? YELLOW_ACCENT : YELLOW_MAIN,
                  marginRight: 15,
                }}
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: date (left) + photo credit (right) on matching grey chips */}
      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          bottom: 56,
          display: 'flex',
          alignItems: 'center',
          fontSize: 20,
        }}
      >
        <div style={chipStyle}>{date}</div>
        {credit && <div style={{ ...chipStyle, marginLeft: 'auto' }}>{credit}</div>}
      </div>
    </div>
  );
}
