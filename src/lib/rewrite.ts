/**
 * Rewrite a tweet into a punchy, viral-style headline using a free LLM.
 * Used for both the Instagram caption and the matching on-image card
 * headline of a published post, so the two always say the same thing.
 *
 * Provider: Pollinations' text API — free, keyless, so the app stays
 * auth-free end to end. Swap the fetch in `tryRewrite()` for another
 * provider later if quality needs to go up; callers only ever see a
 * cleaned string (rewritten or the original, never null).
 *
 * Every number, percentage, and fact in the original must survive the
 * rewrite unchanged — only the framing/hook changes. If the rewrite fails,
 * comes back malformed, or drops a number from the source, the original
 * (already link-stripped) text is used instead — this is a style upgrade,
 * never a source of new claims.
 */

// Best-effort — falls back to the original tweet text on any failure, so
// fail fast rather than eating into the request's time budget.
const REWRITE_TIMEOUT_MS = 10_000;
const MAX_LENGTH = 140;

// Cache per tweet ID so the card headline and the IG caption always match,
// and repeated requests for the same tweet don't re-call the LLM.
const cache = new Map<string, string>();

export async function viralRewrite(text: string, cacheKey: string): Promise<string> {
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rewritten = await tryRewrite(text);
  const chosen = rewritten ?? text;
  cache.set(cacheKey, chosen);
  return chosen;
}

async function tryRewrite(text: string): Promise<string | null> {
  const prompt =
    'Rewrite this news headline to be punchy and attention-grabbing for a ' +
    'viral social media post, like a breaking-news account. Strict rules: ' +
    'keep every number, percentage, name, and fact exactly as written — do ' +
    'not add, remove, guess, or change any fact. Maximum 140 characters. ' +
    'Plain text only, single line, no hashtags, no emojis, no surrounding ' +
    'quotes, no explanation. Reply with the rewritten headline only.\n\n' +
    `Original: ${text}`;

  try {
    const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
      signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const raw = (await response.text()).trim().replace(/^["'“]+|["'”]+$/g, '');
    if (!raw || raw.includes('\n') || raw.length > MAX_LENGTH) return null;
    if (!preservesNumbers(text, raw)) return null;

    return raw;
  } catch {
    return null;
  }
}

/**
 * Pure helper: true if every number/percentage found in the original also
 * appears verbatim in the rewrite — the guard against a hallucinated fact.
 */
export function preservesNumbers(original: string, rewritten: string): boolean {
  const numbers = original.match(/\d+(\.\d+)?%?/g) ?? [];
  return numbers.every((n) => rewritten.includes(n));
}
