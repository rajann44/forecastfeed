import { describe, expect, it } from 'vitest';
import { captionMarksTweetId, encodeHiddenTweetId } from './hiddenId';

describe('encodeHiddenTweetId / captionMarksTweetId', () => {
  it('round-trips a realistic snowflake-sized tweet ID', () => {
    const id = '2079137235979628761';
    const caption = `Some caption text.${encodeHiddenTweetId(id)}`;
    expect(captionMarksTweetId(caption, id)).toBe(true);
  });

  it('does not match a different tweet ID', () => {
    const caption = `Caption.${encodeHiddenTweetId('123456789012345678')}`;
    expect(captionMarksTweetId(caption, '987654321098765432')).toBe(false);
  });

  it('the encoded suffix is invisible (zero display width characters)', () => {
    const suffix = encodeHiddenTweetId('42');
    expect(suffix.length).toBeGreaterThan(0);
    expect(/^[​‌]+$/.test(suffix)).toBe(true);
  });

  it('returns false for captions with no hidden marker', () => {
    expect(captionMarksTweetId('just a normal caption', '42')).toBe(false);
  });
});
