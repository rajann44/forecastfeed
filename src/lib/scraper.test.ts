import { describe, expect, it } from 'vitest';
import { extractPageTitle, extractStatusUrls } from './scraper';

describe('extractStatusUrls', () => {
  it('extracts status URLs for the given handle', () => {
    const html = '<a href="/Kalshi/status/1800000000000000001">post</a>';
    expect(extractStatusUrls(html, 'Kalshi')).toEqual([
      'https://x.com/Kalshi/status/1800000000000000001',
    ]);
  });

  it('deduplicates repeated status IDs', () => {
    const html = `
      <a href="/Kalshi/status/123">a</a>
      <a href="/Kalshi/status/123/photo/1">b</a>
      href="https://x.com/Kalshi/status/123"
    `;
    expect(extractStatusUrls(html, 'Kalshi')).toEqual([
      'https://x.com/Kalshi/status/123',
    ]);
  });

  it('sorts newest (largest ID) first, beyond Number precision', () => {
    // These two differ only in the last digit — Number would round them equal.
    const html = `
      /Kalshi/status/1800000000000000002
      /Kalshi/status/1800000000000000009
      /Kalshi/status/99
    `;
    expect(extractStatusUrls(html, 'Kalshi')).toEqual([
      'https://x.com/Kalshi/status/1800000000000000009',
      'https://x.com/Kalshi/status/1800000000000000002',
      'https://x.com/Kalshi/status/99',
    ]);
  });

  it('matches the handle case-insensitively but ignores other handles', () => {
    const html = `
      /kalshi/status/111
      /SomeoneElse/status/222
    `;
    expect(extractStatusUrls(html, 'Kalshi')).toEqual([
      'https://x.com/Kalshi/status/111',
    ]);
  });

  it('returns an empty array when no links are present', () => {
    expect(extractStatusUrls('<html><body>nothing here</body></html>', 'Kalshi')).toEqual([]);
  });

  it('does not treat regex metacharacters in the handle as patterns', () => {
    expect(extractStatusUrls('/Kalshi/status/1', 'K.lshi')).toEqual([]);
  });
});

describe('extractPageTitle', () => {
  it('extracts and trims the title', () => {
    expect(extractPageTitle('<title> Kalshi (@Kalshi) / X </title>')).toBe(
      'Kalshi (@Kalshi) / X',
    );
  });

  it('returns null when there is no title', () => {
    expect(extractPageTitle('<html></html>')).toBeNull();
  });
});
