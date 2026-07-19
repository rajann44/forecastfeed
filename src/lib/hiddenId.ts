/**
 * Invisible tweet-ID marker for Instagram captions.
 *
 * The publish pipeline needs to know which tweets were already posted, but
 * captions must not show a visible source link. This encodes the tweet ID
 * as a sequence of zero-width characters appended to the caption — invisible
 * to readers, but greppable by us for dedupe. No database required.
 */

const ZERO = '​'; // zero-width space
const ONE = '‌'; // zero-width non-joiner

/** Invisible suffix encoding the tweet ID in binary. Append to a caption. */
export function encodeHiddenTweetId(id: string): string {
  return BigInt(id)
    .toString(2)
    .split('')
    .map((bit) => (bit === '1' ? ONE : ZERO))
    .join('');
}

/** True if this caption's hidden marker decodes to the given tweet ID. */
export function captionMarksTweetId(caption: string, id: string): boolean {
  const bits = [...caption]
    .filter((ch) => ch === ZERO || ch === ONE)
    .map((ch) => (ch === ONE ? '1' : '0'))
    .join('');
  if (!bits) return false;
  try {
    return BigInt(`0b${bits}`) === BigInt(id);
  } catch {
    return false;
  }
}
