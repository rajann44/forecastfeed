/**
 * Derive a short, concrete, photo-search-friendly phrase from a post's text
 * — the "what should this photo actually show" gist, as opposed to
 * `extractKeywords()` in stockPhoto.ts (plain word-frequency extraction,
 * which can surface abstract or incidental words and return an
 * off-subject image, e.g. a random road sign for a "PM appointed" story).
 *
 * Same free provider as the headline rewrite (Pollinations text API, no
 * key). Returns null on any failure — callers fall back to the existing
 * keyword-based search, never block the card on this.
 */

// Best-effort enhancement, not on the critical path to correctness — fail
// fast so a slow LLM response doesn't eat into the card render's budget.
const TIMEOUT_MS = 8_000;
const MAX_WORDS = 8;
const MAX_LENGTH = 80;

// Cache keyed by the exact input text (not tweet ID) — the same tweet can
// be queried with either its original text (plain preview) or its
// viral-rewritten headline (published post), and those need distinct gists.
const cache = new Map<string, string | null>();

export async function deriveImageQuery(text: string): Promise<string | null> {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  const gist = await tryDeriveGist(text);
  cache.set(text, gist);
  return gist;
}

async function tryDeriveGist(text: string): Promise<string | null> {
  const prompt =
    'Read this news headline and reply with a short stock-photo search ' +
    'phrase (3-6 words) for its main concrete, photographable subject — a ' +
    'specific person, place, object, or type of scene a relevant news photo ' +
    'would show. Avoid abstract or generic words. No punctuation, no quotes, ' +
    'plain words only. Reply with the phrase only.\n\n' +
    `Headline: ${text}`;

  try {
    const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const raw = (await response.text()).trim().replace(/^["'“]+|["'”]+$/g, '').toLowerCase();
    if (!raw || raw.includes('\n') || raw.length > MAX_LENGTH) return null;
    if (raw.split(/\s+/).length > MAX_WORDS) return null;

    return raw;
  } catch {
    return null;
  }
}
