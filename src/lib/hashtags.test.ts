import { describe, expect, it } from 'vitest';
import { buildHashtags } from './hashtags';

describe('buildHashtags', () => {
  it('leads with the brand hashtag, followed by content keywords', () => {
    const tags = buildHashtags('BREAKING: Spain wins the 2026 World Cup');
    expect(tags[0]).toBe('#forecastfeed');
    expect(tags).toContain('#spain');
    expect(tags).toContain('#wins');
    expect(tags).toContain('#world');
    expect(tags).toContain('#cup');
  });

  it('caps the number of keyword tags', () => {
    const tags = buildHashtags(
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet',
      3,
    );
    // brand tag + at most 3 keyword tags
    expect(tags.length).toBeLessThanOrEqual(4);
  });

  it('still returns the brand hashtag when there are no usable keywords', () => {
    expect(buildHashtags('is it up or down? 5%!')).toEqual(['#forecastfeed']);
  });
});
