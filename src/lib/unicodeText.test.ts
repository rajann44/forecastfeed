import { describe, expect, it } from 'vitest';
import { normalizeStyledUnicode } from './unicodeText';

describe('normalizeStyledUnicode', () => {
  it('normalizes the double-struck X from the reported bug', () => {
    expect(normalizeStyledUnicode('NEW: 𝕏 announces it has rebuilt its app')).toBe(
      'NEW: X announces it has rebuilt its app',
    );
  });

  it('normalizes bold and italic ranges', () => {
    expect(normalizeStyledUnicode('𝐁𝐨𝐥𝐝')).toBe('Bold');
    expect(normalizeStyledUnicode('𝐼𝑡𝑎𝑙𝑖𝑐')).toBe('Italic');
  });

  it('normalizes sans-serif and monospace digits', () => {
    expect(normalizeStyledUnicode('𝟏𝟐𝟑')).toBe('123');
    expect(normalizeStyledUnicode('𝟶𝟷𝟸')).toBe('012');
  });

  it('normalizes legacy letterlike-symbol exceptions (double-struck C, H, N, P, Q, R, Z)', () => {
    expect(normalizeStyledUnicode('ℂℍℕℙℚℝℤ')).toBe('CHNPQRZ');
  });

  it('normalizes the italic small h exception', () => {
    expect(normalizeStyledUnicode('ℎ')).toBe('h');
  });

  it('leaves plain ASCII text untouched', () => {
    expect(normalizeStyledUnicode('Plain text, 123, punctuation!')).toBe(
      'Plain text, 123, punctuation!',
    );
  });

  it('leaves unrelated unicode (emoji, accented letters) untouched', () => {
    expect(normalizeStyledUnicode('café 🚀 naïve')).toBe('café 🚀 naïve');
  });
});
