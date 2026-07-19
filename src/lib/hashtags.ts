/**
 * Build a small set of hashtags relevant to a post's content, for the
 * Instagram caption. Reuses the same keyword extraction used for stock
 * photo search — same "what is this post actually about" signal.
 */

import { extractKeywords } from './stockPhoto';

const BRAND_HASHTAG = '#forecastfeed';
const MAX_KEYWORD_TAGS = 5;

/** Pure helper: tweet text -> ordered, deduped hashtags (brand tag first). */
export function buildHashtags(text: string, max = MAX_KEYWORD_TAGS): string[] {
  const keywords = extractKeywords(text, max);
  const tags = keywords.map((word) => `#${word}`);
  return [BRAND_HASHTAG, ...tags];
}
