import { describe, expect, it } from 'vitest';
import { extractEntityCandidates } from './wikiEntity';

describe('extractEntityCandidates', () => {
  it('extracts a single-word entity after a headline prefix', () => {
    expect(
      extractEntityCandidates(
        'NEW: SpaceX to report its first quarterly financial & operational results on August 4.',
      ),
    ).toEqual(['SpaceX', 'August 4']);
  });

  it('extracts a two-word name', () => {
    expect(
      extractEntityCandidates('JUST IN: Jim Cramer declares the market is currently "miserable."'),
    ).toEqual(['Jim Cramer']);
  });

  it('extracts a mid-sentence multi-word org name', () => {
    expect(extractEntityCandidates('16% chance the government takes a stake in Lockheed Martin.')).toEqual([
      'Lockheed Martin',
    ]);
  });

  it('generates sub-phrases for a long run, longest first then sub-phrases', () => {
    expect(
      extractEntityCandidates(
        "BREAKING: Nicaragua's President Daniel Ortega declares the country will no longer hold elections.",
      ),
    ).toEqual(['Nicaragua President Daniel Ortega', 'Daniel Ortega', 'Nicaragua President']);
  });

  it('lets an embedded number continue (not start) a run', () => {
    expect(
      extractEntityCandidates(
        'NEW: NASA celebrates the 57th anniversary of the Apollo 11 Moon landing.',
      ),
    ).toEqual(['NASA', 'Apollo 11 Moon', '11 Moon', 'Apollo 11']);
  });

  it('returns nothing for a headline with no proper nouns', () => {
    expect(extractEntityCandidates('53% chance the stock market opens higher tomorrow.')).toEqual([]);
  });

  it('caps candidates at 4', () => {
    const many = extractEntityCandidates(
      'Alpha Beta met Gamma Delta near Epsilon Zeta and Eta Theta today in Iota Kappa.',
    );
    expect(many.length).toBeLessThanOrEqual(4);
  });
});
