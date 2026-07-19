/**
 * Fetch details for a single tweet as JSON — no official X API.
 *
 * Uses X's public syndication CDN (the same endpoint that powers embedded
 * tweets), which returns structured JSON without authentication.
 */

export interface TweetDetails {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  author: {
    name: string;
    handle: string;
    avatarUrl: string | null;
  };
  likes: number | null;
  replies: number | null;
  /** Direct image URLs attached to the tweet, if any. */
  photos: string[];
  /**
   * True when the tweet shares an external link (e.g. a polymarket.com
   * market link) via `entities.urls`. Distinct from `photos` — tweets whose
   * only t.co link is their own attached media are not flagged.
   */
  hasExternalLink: boolean;
  /** Full raw JSON payload from the syndication endpoint. */
  raw: unknown;
}

export interface TweetDetailsResult {
  id: string;
  url: string;
  ok: boolean;
  details: TweetDetails | null;
  error: string | null;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * The syndication endpoint requires a token derived from the tweet ID.
 * This is the same derivation X's own embed code uses; the Number precision
 * loss on large IDs is expected and matches the reference implementation.
 */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

/** Extract the trailing status ID from an x.com status URL. */
export function statusIdFromUrl(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * True if the tweet text name-drops "polymarket" anywhere (e.g. "NEW
 * POLYMARKET:", a self-promotional mention). Case-insensitive.
 */
export function mentionsPolymarket(text: string): boolean {
  return /polymarket/i.test(text);
}

/** Combined skip rule: exclude tweets with an external link or a self-mention. */
export function shouldSkipTweet(details: Pick<TweetDetails, 'text' | 'hasExternalLink'>): boolean {
  return details.hasExternalLink || mentionsPolymarket(details.text);
}

export async function fetchTweetDetails(id: string, url: string): Promise<TweetDetailsResult> {
  const endpoint =
    `https://cdn.syndication.twimg.com/tweet-result` +
    `?id=${id}&token=${syndicationToken(id)}&lang=en`;

  try {
    const response = await fetch(endpoint, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        id,
        url,
        ok: false,
        details: null,
        error: `Syndication endpoint responded with HTTP ${response.status}`,
      };
    }

    const raw = (await response.json()) as Record<string, unknown>;

    // Tombstones / withheld tweets come back without a text field.
    if (typeof raw.text !== 'string') {
      return {
        id,
        url,
        ok: false,
        details: null,
        error: `Unexpected payload shape (typename: ${String(raw.__typename ?? 'unknown')})`,
      };
    }

    return { id, url, ok: true, details: normalizeTweet(id, url, raw), error: null };
  } catch (err) {
    return {
      id,
      url,
      ok: false,
      details: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Fetch details for many tweets in parallel; failures are per-tweet, not fatal. */
export async function fetchAllTweetDetails(urls: string[]): Promise<TweetDetailsResult[]> {
  return Promise.all(
    urls.map((url) => {
      const id = statusIdFromUrl(url);
      if (!id) {
        return {
          id: '',
          url,
          ok: false,
          details: null,
          error: 'Could not parse status ID from URL',
        } satisfies TweetDetailsResult;
      }
      return fetchTweetDetails(id, url);
    }),
  );
}

export function normalizeTweet(
  id: string,
  url: string,
  raw: Record<string, unknown>,
): TweetDetails {
  const user = (raw.user ?? {}) as Record<string, unknown>;
  const photos = Array.isArray(raw.photos)
    ? (raw.photos as Array<Record<string, unknown>>)
        .map((p) => p.url)
        .filter((u): u is string => typeof u === 'string')
    : [];

  const entities = (raw.entities ?? {}) as Record<string, unknown>;
  const hasExternalLink = Array.isArray(entities.urls) && entities.urls.length > 0;

  return {
    id,
    url,
    text: String(raw.text ?? ''),
    createdAt: String(raw.created_at ?? ''),
    author: {
      name: String(user.name ?? ''),
      handle: String(user.screen_name ?? ''),
      avatarUrl: typeof user.profile_image_url_https === 'string' ? user.profile_image_url_https : null,
    },
    likes: typeof raw.favorite_count === 'number' ? raw.favorite_count : null,
    replies: typeof raw.conversation_count === 'number' ? raw.conversation_count : null,
    photos,
    hasExternalLink,
    raw,
  };
}
