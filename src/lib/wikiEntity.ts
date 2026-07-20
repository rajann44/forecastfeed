/**
 * Find a directly-relevant photo for a named entity mentioned in a headline,
 * via Wikipedia — a different tier of relevance than generic keyword-based
 * stock photo search (see stockPhoto.ts): a real photo of the actual
 * person/place/event the post is about, not just an image that happens to
 * match a few keywords. Free, keyless, no rate-limit concerns at this
 * volume, and Wikipedia's coverage of the notable public figures and
 * organizations this app's headlines are usually about is excellent.
 *
 * Entity extraction is a lightweight heuristic, not real NER — this app's
 * headlines are near-uniformly "PREFIX: Subject verb-phrase" (e.g. "JUST
 * IN: Jim Cramer declares..."), so runs of capitalized words (allowing an
 * embedded number, e.g. "Apollo 11") are a reliable proxy for "this is
 * probably the subject." Every step degrades gracefully to null — a caller
 * falls back to keyword-based stock search when this finds nothing.
 */

const WIKI_TIMEOUT_MS = 6_000;
const MAX_CANDIDATES = 4;
const HEADLINE_PREFIX = /^(NEW|JUST IN|BREAKING|UPDATE)\s*[:\-—]\s*/i;
const NOT_ENTITIES = new Set(['new', 'just', 'in', 'breaking', 'update', 'the', 'a', 'an']);

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
 * Pure helper: pull candidate proper-noun phrases out of headline text,
 * ordered by likely relevance — position in the sentence first (the
 * subject is almost always mentioned early), then longer phrases before
 * their trailing/leading sub-phrases (e.g. "FBI Director Kash Patel" before
 * just "Kash Patel", since an exact Wikipedia title match is unlikely for
 * the full run but its sub-phrases often hit).
 */
export function extractEntityCandidates(headline: string): string[] {
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

  const candidates: string[] = [];
  for (const run of runs) {
    if (run.length >= 2) {
      candidates.push(run.join(' '));
      if (run.length > 2) {
        candidates.push(run.slice(-2).join(' '));
        candidates.push(run.slice(0, 2).join(' '));
      }
    } else if (run.length === 1 && !NOT_ENTITIES.has(run[0].toLowerCase())) {
      candidates.push(run[0]);
    }
  }
  return [...new Set(candidates)].slice(0, MAX_CANDIDATES);
}

export interface WikiImageHit {
  url: string;
  credit: string;
  title: string;
}

async function fetchSummary(title: string): Promise<WikiImageHit | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(WIKI_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    type?: string;
    title?: string;
    originalimage?: { source?: string };
    thumbnail?: { source?: string };
  };
  // An ambiguous title (e.g. a common surname) isn't a confident match.
  if (data.type === 'disambiguation') return null;

  const image = data.originalimage?.source ?? data.thumbnail?.source;
  if (!image) return null;
  // Flags/seals/logos are SVG-sourced — Wikipedia auto-rasterizes them to a
  // .png thumbnail for the summary API, but the URL path still contains the
  // original .svg segment. That's how a flat logo is told apart from a real
  // photo; a flag or seal makes a poor full-bleed card background.
  if (/\.svg\//i.test(image)) return null;
  // The card renderer (Satori) only decodes JPEG/PNG.
  if (!/\.(jpe?g|png)(\?|$)/i.test(image)) return null;

  return { url: image, credit: 'Photo: Wikipedia', title: data.title ?? title };
}

/**
 * Try each candidate entity, returning the first real photo found in
 * candidate-priority order. Candidates are looked up in parallel (each is
 * an independent guess, not a progressive relaxation of one query) but
 * still resolved in priority order, not first-to-respond order — matches
 * how fetchStockBackground() picks among its own parallel query variants.
 */
export async function fetchWikipediaEntityImage(headline: string): Promise<WikiImageHit | null> {
  const candidates = extractEntityCandidates(headline);
  if (candidates.length === 0) return null;

  const attempts = await Promise.allSettled(candidates.map(fetchSummary));
  for (const attempt of attempts) {
    if (attempt.status === 'fulfilled' && attempt.value) return attempt.value;
  }
  return null;
}
