import { NaiveDate } from '@/lib/budgets/dateUtil';

/** Compare two NaiveDates. Returns negative, 0, or positive. */
function compareDate(a: NaiveDate, b: NaiveDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** Return the later of two NaiveDates. */
function maxDate(a: NaiveDate, b: NaiveDate): NaiveDate {
  return compareDate(a, b) >= 0 ? a : b;
}

/** Return the earlier of two NaiveDates. */
function minDate(a: NaiveDate, b: NaiveDate): NaiveDate {
  return compareDate(a, b) <= 0 ? a : b;
}

/**
 * A half-open or closed interval of {@link NaiveDate} values.
 *
 * - `end === null` means the interval is open (unbounded on the right).
 * - Both endpoints are **inclusive**.
 *
 * @throws {RangeError} if `end` is not null and `start > end`.
 */
export class DateRange {
  readonly start: NaiveDate;
  readonly end: NaiveDate | null;

  constructor(start: NaiveDate, end: NaiveDate | null) {
    if (end !== null && compareDate(start, end) > 0) {
      throw new RangeError(
        `DateRange start (${start.toString()}) must not be after end (${end.toString()}).`,
      );
    }
    this.start = start;
    this.end = end;
  }
}

/**
 * Compute the intersection of two {@link DateRange} intervals.
 *
 * Both endpoints are treated as **inclusive**.
 * An open end (`null`) means "extends to infinity".
 *
 * @returns The overlapping {@link DateRange}, or `null` if the ranges do not overlap.
 */
export function overlap(a: DateRange, b: DateRange): DateRange | null {
  // The intersection starts at the later of the two starts.
  const overlapStart = maxDate(a.start, b.start);

  // The intersection ends at the earlier of the two ends.
  // null means +∞, so: min(null, x) = x, min(null, null) = null.
  let overlapEnd: NaiveDate | null;
  if (a.end === null && b.end === null) {
    overlapEnd = null;
  } else if (a.end === null) {
    overlapEnd = b.end;
  } else if (b.end === null) {
    overlapEnd = a.end;
  } else {
    overlapEnd = minDate(a.end, b.end);
  }

  // No overlap when the candidate end is strictly before the candidate start.
  if (overlapEnd !== null && compareDate(overlapStart, overlapEnd) > 0) {
    return null;
  }

  return new DateRange(overlapStart, overlapEnd);
}

/**
 * Return `true` when two {@link DateRange} values represent the same interval.
 *
 * Two ranges are equal when their `start` dates are the same day **and** their
 * `end` dates are either both `null` or the same day.
 */
export function dateRangeEquals(a: DateRange, b: DateRange): boolean {
  if (compareDate(a.start, b.start) !== 0) return false;
  if (a.end === null && b.end === null) return true;
  if (a.end === null || b.end === null) return false;
  return compareDate(a.end, b.end) === 0;
}