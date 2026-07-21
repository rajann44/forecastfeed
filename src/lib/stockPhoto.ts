/**
 * Find a free stock photo relevant to a tweet's text, for use as a card
 * background, cropped/resized toward 1080×1350 (4:5 portrait).
 *
 * Provider chain (first configured + first hit wins):
 *   1. Pexels    — needs PEXELS_API_KEY        (free: pexels.com/api)
 *   2. Unsplash  — needs UNSPLASH_ACCESS_KEY   (free: unsplash.com/developers)
 *   3. Pixabay   — needs PIXABAY_API_KEY       (free: pixabay.com/api/docs)
 *   4. Openverse — no key needed (CC-licensed aggregator), works out of the box
 *
 * Pexels/Unsplash serve exact 1080×1350 crops via URL params; for the others
 * the final crop is enforced by the card renderer (objectFit: cover on a
 * 1080×1350 canvas).
 */

export interface StockBackground {
  /** Image downloaded and inlined, ready for the card renderer. */
  dataUri: string;
  /** e.g. "Photo: John Doe / Pexels" — rendered as a small credit line. */
  credit: string;
  provider: string;
  query: string;
}

const WIDTH = 1080;
const HEIGHT = 1350;
// These are meant to be quick "try and move on" lookups tried in sequence
// (up to MAX_QUERIES x 4 providers) — a generous per-call timeout here
// multiplies into tens of seconds of worst-case latency for the whole card
// render, which is what's actually posted to Instagram's servers to fetch.
const SEARCH_TIMEOUT_MS = 6_000;
const DOWNLOAD_TIMEOUT_MS = 10_000;
// Hard cap on how many relaxed queries we'll try. Queries run in parallel
// within a provider stage (bounded by SEARCH_TIMEOUT_MS regardless of how
// many), so this mostly caps outbound request volume, not latency — raised
// from 5 to make room for both the subject phrases and a keyword-combo
// fallback without either starving the other.
const MAX_QUERIES = 7;

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by',
  'as', 'it', 'its', 'this', 'that', 'these', 'those', 'has', 'have', 'had',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'just', 'now',
  'today', 'tomorrow', 'yesterday', 'breaking', 'news', 'update', 'live',
  'new', 'more', 'most', 'than', 'into', 'over', 'under', 'out', 'off', 'up',
  'down', 'about', 'after', 'before', 'between', 'per', 'vs', 'his', 'her',
  'their', 'our', 'your', 'they', 'them', 'we', 'you', 'he', 'she', 'who',
  'what', 'when', 'where', 'why', 'how', 'all', 'any', 'some', 'no', 'not',
  'only', 'very', 'chance', 'odds', 'current',
]);

/**
 * Pure helper: pull the most search-worthy words out of tweet text.
 * Strips links/mentions/hashtags/punctuation, drops stopwords, short tokens
 * and pure numbers (years/percentages don't help photo search), dedupes, and
 * preserves original order — the leading words of a post usually carry its
 * subject.
 */
export function extractKeywords(text: string, max = 5): string[] {
  const words = text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\w+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const keywords: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower.length < 3 || /^\d+$/.test(lower)) continue;
    if (STOPWORDS.has(lower)) continue;
    if (keywords.includes(lower)) continue;
    keywords.push(lower);
    if (keywords.length >= max) break;
  }
  return keywords;
}

const HEADLINE_PREFIX = /^(NEW|JUST IN|BREAKING|UPDATE)\s*[:\-—]\s*/i;
const NOT_SUBJECTS = new Set(['new', 'just', 'in', 'breaking', 'update', 'the', 'a', 'an']);
const MAX_SUBJECT_PHRASES = 3;

function looksProper(word: string): boolean {
  const clean = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!clean) return false;
  return /^[A-Z][a-z]/.test(clean) || /^[A-Z]{2,6}$/.test(clean);
}

function isNumeric(word: string): boolean {
  return /^\d+(st|nd|rd|th)?$/.test(word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''));
}

function cleanWord(word: string): string {
  return word.replace(/^[^A-Za-z0-9]+|['’][a-z]*$|[^A-Za-z0-9]+$/g, '');
}

/**
 * Pure helper: pull the headline's main subject — the specific person,
 * place, or organization it names, as a phrase rather than individual
 * keywords — out of its text. A generic per-word keyword search treats
 * "Kash", "Patel", "Director" and "FBI" as four independent, equally-weighted
 * terms; this instead recognizes "Kash Patel" as one subject worth searching
 * for as an exact phrase, which existing photo archives (Openverse in
 * particular, which aggregates Wikimedia Commons) turn out to have real,
 * specific, directly relevant photos for surprisingly often.
 *
 * Not real NER — this app's headlines are near-uniformly "PREFIX: Subject
 * verb-phrase" (e.g. "JUST IN: Jim Cramer declares..."), so a run of
 * capitalized words (allowing an embedded number, e.g. "Apollo 11") is a
 * reliable proxy for "this is probably the subject." Ordered by likely
 * relevance: position in the sentence first (the subject is almost always
 * mentioned early), then longer phrases before their sub-phrases (e.g. "FBI
 * Director Kash Patel" before just "Kash Patel", since the full run is
 * unlikely to be a literal indexed phrase but its sub-phrases often are).
 */
export function extractSubjectPhrases(headline: string): string[] {
  const text = headline.replace(HEADLINE_PREFIX, '');
  const words = text.split(/\s+/);

  const runs: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    if (looksProper(word)) {
      current.push(cleanWord(word));
    } else if (isNumeric(word) && current.length > 0) {
      // A number continues (but never starts) a run — "Apollo 11", "World War 2".
      current.push(cleanWord(word));
    } else {
      if (current.length > 0) runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);

  const phrases: string[] = [];
  for (const run of runs) {
    if (run.length >= 3) {
      // A 3+ word run is very often "Title/Descriptor + Actual Name" (e.g.
      // "FBI Director Kash Patel", "Nicaragua President Daniel Ortega") —
      // searched live, the full diluted phrase still reliably returns
      // *some* loosely-related match (a title/tag match on the topic in
      // general, not the specific person), which then wins over the sharper
      // sub-phrase purely by being tried first. Trying the last-2-words
      // sub-phrase first (almost always "FirstName LastName") avoids that;
      // the full run is still tried, just last, as a weaker fallback.
      phrases.push(run.slice(-2).join(' '));
      phrases.push(run.slice(0, 2).join(' '));
      phrases.push(run.join(' '));
    } else if (run.length === 2) {
      phrases.push(run.join(' '));
    } else if (run.length === 1 && !NOT_SUBJECTS.has(run[0].toLowerCase())) {
      phrases.push(run[0]);
    }
  }
  return [...new Set(phrases)].slice(0, MAX_SUBJECT_PHRASES);
}

/**
 * Search the provider chain and return an inlined background, or null.
 * Query priority: an explicit `gistHint` (a short "what should this photo
 * actually show" phrase, passed by a caller via /api/card's `?gist=` param)
 * first, when given; then the headline's own main subject phrase (see
 * extractSubjectPhrases — a real person/org/place name, searched as an exact
 * phrase); then generic per-word keyword combos, relaxed progressively (all
 * keywords → 3 → 2 → 1) because archives often have zero hits for very
 * specific phrases.
 *
 * For a given provider, all query variants are searched in parallel and the
 * most specific one that hit wins — sequential-per-query would pay each
 * query's full timeout on every miss before trying the next, which is most
 * of this function's latency when only one keyless provider is configured.
 */
export async function fetchStockBackground(
  text: string,
  gistHint?: string | null,
): Promise<StockBackground | null> {
  const keywords = extractKeywords(text);
  if (keywords.length === 0 && !gistHint) return null;

  // The gist is short (3-6 words), but archives can still whiff on the full
  // phrase (e.g. a named person + a place together) while having plenty for
  // a sub-slice of it (just the place). Try the full gist, then its last
  // and first halves, before falling back to keyword-based relaxation.
  const gistWords = gistHint?.split(/\s+/).filter(Boolean) ?? [];
  const gistQueries =
    gistWords.length > 2
      ? [gistHint!, gistWords.slice(-2).join(' '), gistWords.slice(0, 2).join(' ')]
      : gistHint
        ? [gistHint]
        : [];

  // The headline's main subject (see extractSubjectPhrases) is searched as
  // an exact phrase before the generic per-word keyword combos below — a
  // photo of/from the specific person or organization a post names beats a
  // generic scene that merely contains matching keywords.
  const subjectQueries = extractSubjectPhrases(text);

  const queries = [
    ...new Set(
      [
        ...gistQueries,
        ...subjectQueries,
        ...[keywords, keywords.slice(0, 3), keywords.slice(0, 2), keywords.slice(0, 1)].map((k) =>
          k.join(' '),
        ),
      ].filter(Boolean),
    ),
  ].slice(0, MAX_QUERIES);

  const providers = [searchPexels, searchUnsplash, searchPixabay, searchOpenverse];
  for (const search of providers) {
    const attempts = await Promise.allSettled(queries.map((query) => search(query)));
    for (const [i, attempt] of attempts.entries()) {
      if (attempt.status !== 'fulfilled' || !attempt.value) continue;
      try {
        const dataUri = await downloadAsDataUri(attempt.value.url);
        if (dataUri) {
          return { dataUri, credit: attempt.value.credit, provider: attempt.value.provider, query: queries[i] };
        }
      } catch {
        // A provider being down or rate-limited should not sink the card.
      }
    }
  }
  return null;
}

interface ProviderHit {
  url: string;
  credit: string;
  provider: string;
}

async function searchPexels(query: string): Promise<ProviderHit | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`,
    { headers: { Authorization: key }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    photos?: Array<{ src?: { original?: string }; photographer?: string }>;
  };
  const photo = data.photos?.find((p) => p.src?.original);
  if (!photo?.src?.original) return null;

  return {
    // Pexels serves imgix-style params — exact 1080×1350 crop at the source.
    url: `${photo.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=${WIDTH}&h=${HEIGHT}`,
    credit: `Photo: ${photo.photographer ?? 'Unknown'} / Pexels`,
    provider: 'pexels',
  };
}

async function searchUnsplash(query: string): Promise<ProviderHit | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`,
    {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{ urls?: { raw?: string }; user?: { name?: string } }>;
  };
  const photo = data.results?.find((p) => p.urls?.raw);
  if (!photo?.urls?.raw) return null;

  return {
    url: `${photo.urls.raw}&fit=crop&w=${WIDTH}&h=${HEIGHT}`,
    credit: `Photo: ${photo.user?.name ?? 'Unknown'} / Unsplash`,
    provider: 'unsplash',
  };
}

async function searchPixabay(query: string): Promise<ProviderHit | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&orientation=vertical&image_type=photo&per_page=5`,
    { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    hits?: Array<{ largeImageURL?: string; user?: string }>;
  };
  const photo = data.hits?.find((h) => h.largeImageURL);
  if (!photo?.largeImageURL) return null;

  return {
    url: photo.largeImageURL,
    credit: `Photo: ${photo.user ?? 'Unknown'} / Pixabay`,
    provider: 'pixabay',
  };
}

/** Keyless fallback: Openverse aggregates CC-licensed images. */
async function searchOpenverse(query: string): Promise<ProviderHit | null> {
  const res = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&orientation=tall&page_size=5`,
    {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{ url?: string; creator?: string; source?: string; fields_matched?: string[] }>;
  };
  const photo = data.results?.find(
    (r) =>
      r.url &&
      // Openverse aggregates arbitrary formats; the card renderer (Satori)
      // can only decode JPEG/PNG, so skip .webp/.svg/etc. results.
      /\.(jpe?g|png)(\?|$)/i.test(r.url) &&
      // Openverse's free-text search also matches a photo's description,
      // which can pull in results with nothing to do with the query — seen
      // live: a search for a named person matched two camera-filename
      // ("DSC02486") photos whose caption happened to share unrelated
      // words. Requiring the match include the title or an actual tag
      // filters those out, keeping only photos that are really about what
      // was searched for.
      (r.fields_matched?.includes('title') || r.fields_matched?.includes('tags.name')),
  );
  if (!photo?.url) return null;

  return {
    url: photo.url,
    credit: `Photo: ${photo.creator ?? 'Unknown'} / Openverse`,
    provider: 'openverse',
  };
}

async function downloadAsDataUri(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  // The card renderer (Satori) only decodes JPEG and PNG — anything else
  // (webp, svg, avif) crashes the render, so reject it here.
  if (!/^image\/(jpeg|png)/.test(contentType)) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) return null;

  return `data:${contentType};base64,${buffer.toString('base64')}`;
}
