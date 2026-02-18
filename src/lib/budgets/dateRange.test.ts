import { describe, it, expect } from 'vitest';
import { DateRange, overlap } from '@/lib/budgets/dateRange';
import { NaiveDate } from '@/lib/budgets/dateUtil';

// ── helpers ──────────────────────────────────────────────────────────────────

function d(s: string): NaiveDate {
  return NaiveDate.fromString(s);
}

function range(start: string, end: string | null): DateRange {
  return new DateRange(d(start), end === null ? null : d(end));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('DateRange', () => {
  // (I) Interface – construction
  describe('construction', () => {
    it('creates a closed range with start and end', () => {
      // Arrange / Act
      const r = range('2026-01-01', '2026-01-31');
      // Assert
      expect(r.start.toString()).toBe('2026-01-01');
      expect(r.end?.toString()).toBe('2026-01-31');
    });

    it('creates an open-ended range when end is null', () => {
      const r = range('2026-01-01', null);
      expect(r.start.toString()).toBe('2026-01-01');
      expect(r.end).toBeNull();
    });

    it('allows a single-day range (start === end)', () => {
      const r = range('2026-06-15', '2026-06-15');
      expect(r.start.toString()).toBe('2026-06-15');
      expect(r.end?.toString()).toBe('2026-06-15');
    });

    // (E) Exceptions
    it('throws when start is after end', () => {
      expect(() => range('2026-02-01', '2026-01-01')).toThrow(RangeError);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('overlap', () => {
  // (S) Simple – two clearly overlapping closed ranges
  it('returns the overlapping sub-range for two overlapping closed ranges', () => {
    // Arrange
    const a = range('2026-01-01', '2026-03-31');
    const b = range('2026-02-01', '2026-04-30');
    // Act
    const result = overlap(a, b);
    // Assert
    expect(result).not.toBeNull();
    expect(result!.start.toString()).toBe('2026-02-01');
    expect(result!.end?.toString()).toBe('2026-03-31');
  });

  // (O) One – overlap of exactly one day
  it('returns a single-day range when ranges share exactly one day', () => {
    const a = range('2026-01-01', '2026-01-15');
    const b = range('2026-01-15', '2026-01-31');
    const result = overlap(a, b);
    expect(result).not.toBeNull();
    expect(result!.start.toString()).toBe('2026-01-15');
    expect(result!.end?.toString()).toBe('2026-01-15');
  });

  // (Z) Zero – no overlap
  it('returns null when ranges do not overlap', () => {
    const a = range('2026-01-01', '2026-01-31');
    const b = range('2026-02-01', '2026-02-28');
    expect(overlap(a, b)).toBeNull();
  });

  // (B) Boundary – adjacent ranges (end of A is the day before start of B)
  it('returns null for adjacent ranges that do not share a day', () => {
    const a = range('2026-01-01', '2026-01-14');
    const b = range('2026-01-15', '2026-01-31');
    // They are adjacent but share no day — no overlap
    // (overlap is inclusive, so [Jan1–Jan14] ∩ [Jan15–Jan31] = ∅)
    const result = overlap(a, b);
    expect(result).toBeNull();
  });

  // (M) Many – b is fully contained within a
  it('returns b when b is fully contained within a', () => {
    const a = range('2026-01-01', '2026-12-31');
    const b = range('2026-06-01', '2026-06-30');
    const result = overlap(a, b);
    expect(result).not.toBeNull();
    expect(result!.start.toString()).toBe('2026-06-01');
    expect(result!.end?.toString()).toBe('2026-06-30');
  });

  it('is commutative: overlap(a,b) equals overlap(b,a)', () => {
    const a = range('2026-01-01', '2026-06-30');
    const b = range('2026-04-01', '2026-09-30');
    const ab = overlap(a, b);
    const ba = overlap(b, a);
    expect(ab?.start.toString()).toBe(ba?.start.toString());
    expect(ab?.end?.toString()).toBe(ba?.end?.toString());
  });

  // Open-ended ranges
  describe('open-ended ranges', () => {
    it('overlaps a closed range with an open-ended range', () => {
      const a = range('2026-01-01', '2026-06-30');
      const b = range('2026-04-01', null); // open end
      const result = overlap(a, b);
      expect(result).not.toBeNull();
      expect(result!.start.toString()).toBe('2026-04-01');
      expect(result!.end?.toString()).toBe('2026-06-30');
    });

    it('returns an open-ended overlap when both ranges are open-ended', () => {
      const a = range('2026-01-01', null);
      const b = range('2026-06-01', null);
      const result = overlap(a, b);
      expect(result).not.toBeNull();
      expect(result!.start.toString()).toBe('2026-06-01');
      expect(result!.end).toBeNull();
    });

    it('returns null when a closed range ends before an open range starts', () => {
      const a = range('2026-01-01', '2026-03-31');
      const b = range('2026-06-01', null);
      expect(overlap(a, b)).toBeNull();
    });

    it('open-ended range starting before a closed range covers the whole closed range', () => {
      const a = range('2025-01-01', null);
      const b = range('2026-01-01', '2026-12-31');
      const result = overlap(a, b);
      expect(result).not.toBeNull();
      expect(result!.start.toString()).toBe('2026-01-01');
      expect(result!.end?.toString()).toBe('2026-12-31');
    });
  });
});
