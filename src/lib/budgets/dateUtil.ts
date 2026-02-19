/** ISO 8601 date string, e.g. "2026-01-15". */
type IsoDateString = string;

/** Regex that matches YYYY-MM-DD and nothing else. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A timezone-naive date that stores only year, month, and day.
 *
 * Construction is intentionally limited to the static factory
 * {@link NaiveDate.fromString} so that every instance is guaranteed to
 * represent a valid calendar date.
 */
export class NaiveDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  private constructor(year: number, month: number, day: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }

  /**
   * Parse an ISO 8601 date string (`YYYY-MM-DD`) into a {@link NaiveDate}.
   *
   * @throws {RangeError} if the string is not a valid ISO 8601 calendar date.
   */
  static fromString(raw: IsoDateString): NaiveDate {
    const match = ISO_DATE_RE.exec(raw);
    if (match === null) {
      throw new RangeError(
        `Invalid ISO 8601 date string: "${raw}". Expected format YYYY-MM-DD.`,
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12) {
      throw new RangeError(`Month ${month} is out of range [1, 12].`);
    }

    const maxDay = NaiveDate.#daysInMonth(year, month);
    if (day < 1 || day > maxDay) {
      throw new RangeError(
        `Day ${day} is out of range [1, ${maxDay}] for ${year}-${String(month).padStart(2, '0')}.`,
      );
    }

    return new NaiveDate(year, month, day);
  }

  /**
   * Serialise back to an ISO 8601 date string (`YYYY-MM-DD`).
   * The output is always zero-padded so it round-trips with {@link fromString}.
   */
  toString(): IsoDateString {
    const mm = String(this.month).padStart(2, '0');
    const dd = String(this.day).padStart(2, '0');
    return `${this.year}-${mm}-${dd}`;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  static #isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  static #daysInMonth(year: number, month: number): number {
    const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && NaiveDate.#isLeapYear(year)) return 29;
    return days[month]!;
  }
}