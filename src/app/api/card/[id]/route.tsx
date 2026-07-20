import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { BRAND_GRADIENT, BRAND_MONOGRAM } from '@/lib/brand';
import { fetchStockBackground } from '@/lib/stockPhoto';
import { fetchTweetDetails, type TweetDetails } from '@/lib/tweetDetails';

// Cards are rendered live from the latest tweet data.
export const dynamic = 'force-dynamic';

const WIDTH = 1080;
const HEIGHT = 1350; // 4:5 portrait

// Two-tone headline palette: white for most of the text, one bright yellow
// for the accent words — same two-color pattern as the blue-and-white
// reference, with yellow substituted for blue.
const HEADLINE_WHITE = '#ffffff';
const YELLOW_ACCENT = '#ffee58';
const YELLOW_BAR = '#ffd60a';

// The glass headline panel is anchored by a fixed top-left origin (not
// bottom-anchored) so its position is known in advance — required for the
// blurred-background-window trick below to align correctly.
const BOX_TOP = 680;
const BOX_LEFT = 56;
const BOX_PADDING_Y = 32;
const BOX_PADDING_X = 40;
const RULE_HEIGHT = 5;
const RULE_MARGIN_BOTTOM = 22;
const HEADLINE_FONT_SIZE = 58;
const HEADLINE_LINE_HEIGHT = 1.35;

// The footer (date + photo credit chips) flows in normal layout directly
// below the panel, not independently absolute-positioned at a fixed bottom
// offset — that previously left a gap between panel and footer that grew or
// shrank with however much headline text there was, which didn't match the
// fixed, even side margins. It also means the footer just follows the panel
// to whatever height it renders at, however long the headline is — no
// headline-length cap or truncation needed to avoid an overlap. FOOTER_GAP
// reuses BOX_LEFT so that gap always equals the side margins, by request.
const FOOTER_GAP = BOX_LEFT;


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

/** Strip t.co links and collapse whitespace. */
function cleanTweetText(text: string): string {
  return text.replace(/https?:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Headline color for the word at `i` of `total` — four evenly-sized bands
 * across the whole headline, alternating yellow/white/yellow/white (not
 * just an accent on the first few words). `Math.floor((i * 4) / total)` is
 * the standard "split N items into 4 equal-as-possible buckets" formula, so
 * the bands stay even regardless of word count.
 */
function headlineWordColor(i: number, total: number): string {
  const band = Math.min(3, Math.floor((i * 4) / total));
  return band % 2 === 0 ? YELLOW_ACCENT : HEADLINE_WHITE;
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
  // with the tweet fetch/stock-photo work below instead of adding on top of
  // it.
  const pendingFonts = loadFonts();

  const tweet = await fetchTweetDetails(id, `https://x.com/i/status/${id}`);
  if (!tweet.ok || !tweet.details) {
    return NextResponse.json(
      { error: tweet.error ?? 'Tweet not found' },
      { status: 502 },
    );
  }

  // ?headline= lets the publish flow render the same text shown in the
  // Instagram caption (the original tweet text — see /api/publish). With no
  // override (e.g. the web UI preview), the card shows the original tweet
  // text directly. Whichever text is actually shown as the headline also
  // drives the image search below, so the background always matches what
  // the card says.
  const query = new URL(request.url).searchParams;
  const headlineOverride = query.get('headline');
  const searchText = headlineOverride ? headlineOverride.trim() : tweet.details.text;
  const headline = headlineOverride ? searchText : cleanTweetText(tweet.details.text);

  // Backgrounds always come from free stock photos — the tweet's own media
  // is intentionally never used. An optional ?gist= lets a caller pass a
  // short "what should this photo actually show" hint to target the search
  // better than plain keyword extraction alone (not currently sent by
  // /api/publish; keyword extraction — see extractKeywords() in
  // stockPhoto.ts — is what actually drives the search day to day).
  const gistHint = query.get('gist') || null;
  const stock = await fetchStockBackground(searchText, gistHint);
  const background = stock?.dataUri ?? null;
  const credit = stock?.credit ?? null;

  const fonts = await pendingFonts;
  const renderOpts = {
    width: WIDTH,
    height: HEIGHT,
    emoji: 'twemoji' as const,
    fonts: [
      { name: 'Montserrat', data: fonts.regular, weight: 400 as const, style: 'normal' as const },
      { name: 'Montserrat', data: fonts.headline, weight: 800 as const, style: 'normal' as const },
    ],
  };

  // Satori/resvg's raster image decoder occasionally throws on a downloaded
  // stock photo it can't handle (seen in production: "RangeError: Offset is
  // outside the bounds of the DataView" on an otherwise-normal JPEG). That
  // throw happens while the response body streams out, not while
  // ImageResponse is constructed, so it can't be caught around `new
  // ImageResponse(...)` itself — it has to be caught while actually reading
  // the body. Buffering here (rather than streaming straight through) lets
  // us retry once without a background image, which always renders cleanly,
  // instead of Instagram receiving a 500 and reporting a confusing "media
  // could not be fetched" error.
  try {
    const buffer = await new ImageResponse(
      <Card details={tweet.details} headline={headline} background={background} credit={credit} />,
      renderOpts,
    ).arrayBuffer();
    return new NextResponse(buffer, { headers: { 'content-type': 'image/png' } });
  } catch {
    const buffer = await new ImageResponse(
      <Card details={tweet.details} headline={headline} background={null} credit={null} />,
      renderOpts,
    ).arrayBuffer();
    return new NextResponse(buffer, { headers: { 'content-type': 'image/png' } });
  }
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

      {/* Panel + footer share one positioned flex column so the footer
          always flows directly below the panel with a fixed gap
          (FOOTER_GAP), instead of the footer being independently
          bottom-anchored and leaving a gap that grew or shrank with however
          much headline text there was. */}
      <div
        style={{
          position: 'absolute',
          top: BOX_TOP,
          left: BOX_LEFT,
          right: BOX_LEFT,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Glass headline box. Real backdrop-blur isn't available in Satori,
            but plain filter: blur() on an element is — so this fakes it with
            the classic pre-backdrop-filter trick: an oversized copy of
            whatever's behind the panel, blurred, negatively offset by the
            panel's own top-left origin, and clipped to the panel's bounds via
            overflow: hidden. That's why the panel is top-anchored (a fixed,
            known origin) rather than bottom-anchored (whose top edge would
            depend on the box's own auto-computed height). */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            // Not a text-length clip — the panel is unbounded and grows to
            // fit however long the headline is (the footer below simply
            // follows it, see FOOTER_GAP). This overflow: hidden exists only
            // to clip the oversized blurred background window below to the
            // panel's own bounds, for the fake backdrop-blur effect.
            overflow: 'hidden',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.28)',
            padding: `${BOX_PADDING_Y}px ${BOX_PADDING_X}px`,
          }}
        >
          {/* Blurred window into the background, aligned to the panel's
              position so it looks like true see-through glass. */}
          <div style={{ position: 'absolute', top: -BOX_TOP, left: -BOX_LEFT, width: WIDTH, height: HEIGHT, display: 'flex' }}>
            {background ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={background}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(14px)' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  background: 'linear-gradient(160deg, #0a1428 0%, #12245c 55%, #0b2fa3 100%)',
                  filter: 'blur(14px)',
                }}
              />
            )}
          </div>
          {/* Tint over the blur, for legibility and the glass color itself */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              background: 'rgba(20,22,30,0.34)',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* Minimal rule above the headline, inside the glass panel */}
            <div
              style={{
                display: 'flex',
                width: '100%',
                height: RULE_HEIGHT,
                background: YELLOW_BAR,
                marginBottom: RULE_MARGIN_BOTTOM,
              }}
            />
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                fontFamily: 'Montserrat',
                fontSize: HEADLINE_FONT_SIZE,
                fontWeight: 800,
                lineHeight: HEADLINE_LINE_HEIGHT,
              }}
            >
              {words.map((word, i) => (
                <span
                  key={`${i}-${word}`}
                  style={{
                    color: headlineWordColor(i, words.length),
                    marginRight: 15,
                  }}
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer: date (left) + photo credit (right) on matching grey chips.
            A normal flex sibling of the panel above (not absolute), so it
            always sits exactly FOOTER_GAP below however tall the panel
            rendered. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: FOOTER_GAP,
            fontSize: 20,
          }}
        >
          <div style={chipStyle}>{date}</div>
          {credit && <div style={{ ...chipStyle, marginLeft: 'auto' }}>{credit}</div>}
        </div>
      </div>
    </div>
  );
}
