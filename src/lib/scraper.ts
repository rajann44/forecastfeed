/**
 * Reusable scraping logic for public X profile pages.
 * No official API — plain HTML fetch + regex extraction.
 */

export interface ScrapeResult {
  ok: boolean;
  httpStatus: number | null;
  pageTitle: string | null;
  linksFound: number;
  /** Latest post URLs, newest first, capped by `limit`. */
  urls: string[];
  /** ISO timestamp of when the fetch ran. */
  fetchedAt: string;
  /** First chunk of the response body, for debugging what X actually served. */
  htmlSnippet: string;
  error: string | null;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const SNIPPET_LENGTH = 600;

/**
 * Pure helper: extract post URLs like /<handle>/status/<id> from raw HTML.
 * Deduplicates and sorts by status ID descending (newest first — X status
 * IDs are snowflakes, so a bigger ID means a newer post). IDs are compared
 * as BigInt because they exceed Number's safe integer range.
 */
export function extractStatusUrls(html: string, handle: string): string[] {
  const pattern = new RegExp(`/${escapeRegExp(handle)}/status/(\\d+)`, 'gi');
  const ids = new Set<string>();
  for (const match of html.matchAll(pattern)) {
    ids.add(match[1]);
  }
  return [...ids]
    .sort((a, b) => (BigInt(a) < BigInt(b) ? 1 : BigInt(a) > BigInt(b) ? -1 : 0))
    .map((id) => `https://x.com/${handle}/status/${id}`);
}

/** Extract the <title> text from an HTML document, if present. */
export function extractPageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Fetch the public profile page for `handle` and extract recent status URLs.
 */
export async function scrapeProfile(handle: string, limit = 10): Promise<ScrapeResult> {
  const fetchedAt = new Date().toISOString();
  const url = `https://x.com/${handle}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    const html = await response.text();
    const allUrls = extractStatusUrls(html, handle);

    return {
      ok: response.ok,
      httpStatus: response.status,
      pageTitle: extractPageTitle(html),
      linksFound: allUrls.length,
      urls: allUrls.slice(0, limit),
      fetchedAt,
      htmlSnippet: html.slice(0, SNIPPET_LENGTH),
      error: response.ok ? null : `Server responded with HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: null,
      pageTitle: null,
      linksFound: 0,
      urls: [],
      fetchedAt,
      htmlSnippet: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
