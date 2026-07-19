import { describe, expect, it } from 'vitest';
import { extractKeywords } from './stockPhoto';

describe('extractKeywords', () => {
  it('keeps the subject words of a news-style tweet', () => {
    expect(extractKeywords('BREAKING: Spain wins the 2026 World Cup')).toEqual([
      'spain', 'wins', 'world', 'cup',
    ]);
  });

  it('strips links, mentions and hashtags', () => {
    expect(
      extractKeywords('Generational. @Kalshi #markets https://t.co/NZ7TpM3ghw'),
    ).toEqual(['generational']);
  });

  it('drops stopwords, short tokens and pure numbers', () => {
    expect(extractKeywords('90% chance Spain beats Argentina in 2026')).toEqual([
      'spain', 'beats', 'argentina',
    ]);
  });

  it('deduplicates and caps at the max', () => {
    expect(extractKeywords('gold gold silver bronze copper iron zinc', 3)).toEqual([
      'gold', 'silver', 'bronze',
    ]);
  });

  it('returns empty for text with no usable words', () => {
    expect(extractKeywords('is it up or down? 5%!')).toEqual([]);
  });
});
