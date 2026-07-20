import { describe, expect, it } from 'vitest';
import { preservesNumbers } from './rewrite';

describe('preservesNumbers', () => {
  it('accepts a rewrite that keeps every number from the original', () => {
    expect(
      preservesNumbers(
        '85% chance Starship launches by the end of the month.',
        'Starship launch odds hit 85% — will it fly this month?',
      ),
    ).toBe(true);
  });

  it('rejects a rewrite that drops a number', () => {
    expect(
      preservesNumbers('51% chance WTI oil surges above $90 by month-end.', 'Oil odds are rising fast.'),
    ).toBe(false);
  });

  it('rejects a rewrite that changes a number', () => {
    expect(
      preservesNumbers('90% chance Brent crude tops $90.', 'Brent crude odds hit 95% — huge surge ahead.'),
    ).toBe(false);
  });

  it('accepts when the original has no numbers at all', () => {
    expect(preservesNumbers('Spain wins the World Cup.', "Spain just claimed the World Cup title.")).toBe(
      true,
    );
  });
});
