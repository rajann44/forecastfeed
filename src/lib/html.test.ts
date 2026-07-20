import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from './html';

describe('decodeHtmlEntities', () => {
  it('decodes the entity from the reported bug', () => {
    expect(decodeHtmlEntities('cost of living relief &amp; a 10-year plan')).toBe(
      'cost of living relief & a 10-year plan',
    );
  });

  it('decodes the other standard named entities', () => {
    expect(decodeHtmlEntities('&lt;tag&gt; &quot;quoted&quot; &apos;s')).toBe(
      `<tag> "quoted" 's`,
    );
  });

  it('decodes decimal and hex numeric character references', () => {
    expect(decodeHtmlEntities('&#65;&#66;&#x43;')).toBe('ABC');
  });

  it('leaves plain ampersands and unrelated text untouched', () => {
    expect(decodeHtmlEntities('AT&T and Ben & Jerry\'s')).toBe("AT&T and Ben & Jerry's");
  });

  it('leaves unknown named entities untouched rather than mangling them', () => {
    expect(decodeHtmlEntities('&unknownentity;')).toBe('&unknownentity;');
  });
});
