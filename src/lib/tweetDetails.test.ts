import { describe, expect, it } from 'vitest';
import { mentionsPolymarket, shouldSkipTweet } from './tweetDetails';

describe('mentionsPolymarket', () => {
  it('matches the brand name in any casing', () => {
    expect(mentionsPolymarket('NEW POLYMARKET: something big')).toBe(true);
    expect(mentionsPolymarket('trade it on Polymarket now')).toBe(true);
    expect(mentionsPolymarket('polymarket odds just moved')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(mentionsPolymarket('BREAKING: Spain wins the World Cup')).toBe(false);
  });
});

describe('shouldSkipTweet', () => {
  it('skips tweets with an external link', () => {
    expect(shouldSkipTweet({ text: 'no mention here', hasExternalLink: true })).toBe(true);
  });

  it('skips tweets that mention polymarket even without a link', () => {
    expect(shouldSkipTweet({ text: 'Polymarket just hit $1B volume', hasExternalLink: false })).toBe(
      true,
    );
  });

  it('keeps clean tweets', () => {
    expect(shouldSkipTweet({ text: 'BREAKING: Spain wins the World Cup', hasExternalLink: false })).toBe(
      false,
    );
  });
});
