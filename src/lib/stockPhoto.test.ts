import { describe, expect, it } from 'vitest';
import { extractKeywords, extractSubjectPhrases } from './stockPhoto';

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

describe('extractSubjectPhrases', () => {
  it('extracts a single-word subject after a headline prefix', () => {
    expect(
      extractSubjectPhrases(
        'NEW: SpaceX to report its first quarterly financial & operational results on August 4.',
      ),
    ).toEqual(['SpaceX', 'August 4']);
  });

  it('extracts a two-word name', () => {
    expect(
      extractSubjectPhrases('JUST IN: Jim Cramer declares the market is currently "miserable."'),
    ).toEqual(['Jim Cramer']);
  });

  it('extracts a mid-sentence multi-word org name', () => {
    expect(extractSubjectPhrases('16% chance the government takes a stake in Lockheed Martin.')).toEqual([
      'Lockheed Martin',
    ]);
  });

  it('tries the last-2-words sub-phrase before the diluted full run, for a long title+name run', () => {
    // "Nicaragua President Daniel Ortega" as a full phrase reliably matches
    // some loosely-related Nicaragua-politics photo rather than one of
    // Ortega himself (confirmed live against Openverse) — "Daniel Ortega"
    // needs to be tried first, not last.
    expect(
      extractSubjectPhrases(
        "BREAKING: Nicaragua's President Daniel Ortega declares the country will no longer hold elections.",
      ),
    ).toEqual(['Daniel Ortega', 'Nicaragua President', 'Nicaragua President Daniel Ortega']);
  });

  it('lets an embedded number continue (not start) a run', () => {
    expect(
      extractSubjectPhrases('NEW: NASA celebrates the 57th anniversary of the Apollo 11 Moon landing.'),
    ).toEqual(['NASA', '11 Moon', 'Apollo 11']);
  });

  it('returns nothing for a headline with no proper nouns', () => {
    expect(extractSubjectPhrases('53% chance the stock market opens higher tomorrow.')).toEqual([]);
  });
});
