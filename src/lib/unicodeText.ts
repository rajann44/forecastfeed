/**
 * Normalize Unicode "styled text" (the Mathematical Alphanumeric Symbols
 * block, U+1D400-U+1D7FF) back to plain ASCII letters/digits.
 *
 * X has no real bold/italic/etc. text formatting, so "fancy font" tools
 * people use for styled tweets (e.g. "𝕏" instead of "X") work by mapping
 * plain text through this Unicode block instead. Our card font (Montserrat)
 * has no glyphs for it, and Satori has no fallback font configured, so any
 * unmapped character renders as a missing-glyph box on the card.
 */

interface StyledRange {
  start: number;
  base: 'A' | 'a' | '0';
  length: number;
}

// Each style covers capital A-Z then, immediately after, lowercase a-z (26
// each); digit-only styles cover 0-9 (10). Ranges are contiguous within a
// style except for ~20 legacy holes (STYLED_EXCEPTIONS below), where
// Unicode reused a pre-existing "Letterlike Symbols" character instead of
// allocating a new codepoint.
const STYLED_RANGES: StyledRange[] = [
  { start: 0x1d400, base: 'A', length: 26 }, // bold
  { start: 0x1d41a, base: 'a', length: 26 },
  { start: 0x1d434, base: 'A', length: 26 }, // italic
  { start: 0x1d44e, base: 'a', length: 26 },
  { start: 0x1d468, base: 'A', length: 26 }, // bold italic
  { start: 0x1d482, base: 'a', length: 26 },
  { start: 0x1d49c, base: 'A', length: 26 }, // script
  { start: 0x1d4b6, base: 'a', length: 26 },
  { start: 0x1d4d0, base: 'A', length: 26 }, // bold script
  { start: 0x1d4ea, base: 'a', length: 26 },
  { start: 0x1d504, base: 'A', length: 26 }, // fraktur
  { start: 0x1d51e, base: 'a', length: 26 },
  { start: 0x1d538, base: 'A', length: 26 }, // double-struck
  { start: 0x1d552, base: 'a', length: 26 },
  { start: 0x1d56c, base: 'A', length: 26 }, // bold fraktur
  { start: 0x1d586, base: 'a', length: 26 },
  { start: 0x1d5a0, base: 'A', length: 26 }, // sans-serif
  { start: 0x1d5ba, base: 'a', length: 26 },
  { start: 0x1d5d4, base: 'A', length: 26 }, // sans-serif bold
  { start: 0x1d5ee, base: 'a', length: 26 },
  { start: 0x1d608, base: 'A', length: 26 }, // sans-serif italic
  { start: 0x1d622, base: 'a', length: 26 },
  { start: 0x1d63c, base: 'A', length: 26 }, // sans-serif bold italic
  { start: 0x1d656, base: 'a', length: 26 },
  { start: 0x1d670, base: 'A', length: 26 }, // monospace
  { start: 0x1d68a, base: 'a', length: 26 },
  { start: 0x1d7ce, base: '0', length: 10 }, // bold digits
  { start: 0x1d7d8, base: '0', length: 10 }, // double-struck digits
  { start: 0x1d7e2, base: '0', length: 10 }, // sans-serif digits
  { start: 0x1d7ec, base: '0', length: 10 }, // sans-serif bold digits
  { start: 0x1d7f6, base: '0', length: 10 }, // monospace digits
];

const STYLED_EXCEPTIONS: Record<number, string> = {
  // script capitals
  0x212c: 'B', 0x2130: 'E', 0x2131: 'F', 0x210b: 'H', 0x2110: 'I',
  0x2112: 'L', 0x2133: 'M', 0x211b: 'R',
  // script small
  0x212f: 'e', 0x210a: 'g', 0x2134: 'o',
  // fraktur capitals
  0x212d: 'C', 0x210c: 'H', 0x2111: 'I', 0x211c: 'R', 0x2128: 'Z',
  // double-struck capitals ("𝕏" itself is not one of these — it's in the
  // main contiguous range — but ℂℍℕℙℚℝℤ are)
  0x2102: 'C', 0x210d: 'H', 0x2115: 'N', 0x2119: 'P', 0x211a: 'Q',
  0x211d: 'R', 0x2124: 'Z',
  // italic small h ("𝒽" has no dedicated codepoint; ℎ is used instead)
  0x210e: 'h',
};

export function normalizeStyledUnicode(text: string): string {
  let out = '';
  for (const ch of text) {
    const codePoint = ch.codePointAt(0)!;
    const exception = STYLED_EXCEPTIONS[codePoint];
    if (exception) {
      out += exception;
      continue;
    }
    const range = STYLED_RANGES.find(
      (r) => codePoint >= r.start && codePoint < r.start + r.length,
    );
    if (range) {
      const offset = codePoint - range.start;
      out += range.base === '0' ? String(offset) : String.fromCharCode(range.base.charCodeAt(0) + offset);
      continue;
    }
    out += ch;
  }
  return out;
}
