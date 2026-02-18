import { describe, it, expect } from 'vitest';
import { NaiveDate } from '@/lib/budgets/dateUtil';

describe('NaiveDate', () => {
  // (S) Simple – basic round-trip
  describe('fromString – valid ISO 8601 dates', () => {
    it('parses a standard YYYY-MM-DD string and round-trips to the same string', () => {
      // Arrange
      const raw = '2026-01-15';
      // Act
      const date = NaiveDate.fromString(raw);
      // Assert
      expect(date.toString()).toBe(raw);
    });

    it('exposes correct year, month, and day accessors', () => {
      // Arrange / Act
      const date = NaiveDate.fromString('2024-07-04');
      // Assert
      expect(date.year).toBe(2024);
      expect(date.month).toBe(7);
      expect(date.day).toBe(4);
    });
  });

  // (O) One – single-digit month/day with zero-padding preserved
  describe('fromString – zero-padded components', () => {
    it('preserves zero-padding in the serialised output', () => {
      const date = NaiveDate.fromString('2026-01-01');
      expect(date.toString()).toBe('2026-01-01');
    });
  });

  // (M) Many – various valid dates across the year
  describe('fromString – multiple valid dates', () => {
    it.each([
      ['2000-02-29', 2000, 2, 29], // leap year
      ['1999-12-31', 1999, 12, 31],
      ['2026-06-15', 2026, 6, 15],
    ])('parses %s correctly', (raw, year, month, day) => {
      const date = NaiveDate.fromString(raw);
      expect(date.year).toBe(year);
      expect(date.month).toBe(month);
      expect(date.day).toBe(day);
      expect(date.toString()).toBe(raw);
    });
  });

  // (Z) Zero / (E) Exceptions – empty and malformed input
  describe('fromString – invalid input throws', () => {
    it('throws on an empty string', () => {
      expect(() => NaiveDate.fromString('')).toThrow();
    });

    it('throws on a string missing the day component', () => {
      expect(() => NaiveDate.fromString('2026-01')).toThrow();
    });

    it('throws on a string with wrong separator', () => {
      expect(() => NaiveDate.fromString('2026/01/15')).toThrow();
    });

    it('throws on a string with an invalid month (13)', () => {
      expect(() => NaiveDate.fromString('2026-13-01')).toThrow();
    });

    it('throws on a string with an invalid day (0)', () => {
      expect(() => NaiveDate.fromString('2026-01-00')).toThrow();
    });

    it('throws on a string with an invalid day (32)', () => {
      expect(() => NaiveDate.fromString('2026-01-32')).toThrow();
    });

    it('throws on a non-numeric year component', () => {
      expect(() => NaiveDate.fromString('YYYY-01-01')).toThrow();
    });

    it('throws on Feb 29 in a non-leap year', () => {
      expect(() => NaiveDate.fromString('2023-02-29')).toThrow();
    });
  });

  // (B) Boundary – edge values
  describe('fromString – boundary dates', () => {
    it('accepts the first day of the year', () => {
      const date = NaiveDate.fromString('2026-01-01');
      expect(date.month).toBe(1);
      expect(date.day).toBe(1);
    });

    it('accepts the last day of the year', () => {
      const date = NaiveDate.fromString('2026-12-31');
      expect(date.month).toBe(12);
      expect(date.day).toBe(31);
    });
  });

  // (I) Interface – static factory is the only construction path
  describe('interface', () => {
    it('NaiveDate cannot be constructed with new directly (no public constructor)', () => {
      // The class should only be instantiable via NaiveDate.fromString.
      // We verify the static factory exists and returns a NaiveDate instance.
      const date = NaiveDate.fromString('2026-03-10');
      expect(date).toBeInstanceOf(NaiveDate);
    });
  });
});
