// ─────────────────────────────────────────────────────────────────────────────
// BudgetInstance
// ─────────────────────────────────────────────────────────────────────────────

import { DateRange, overlap } from "./dateRange";

/**
 * A single budget entry that is valid for a specific {@link DateRange}.
 *
 * Multiple `BudgetInstance` objects in the same {@link BudgetTreeNode} must
 * cover **non-overlapping** date ranges (enforced by the constructor).
 *
 * @throws {RangeError} if `amount` is negative.
 */
export class BudgetInstance {
  readonly effectiveRange: DateRange;
  readonly amount: number;

  constructor(effectiveRange: DateRange, amount: number) {
    if (amount < 0) {
      throw new RangeError(`BudgetInstance amount must be non-negative, got ${amount}.`);
    }
    this.effectiveRange = effectiveRange;
    this.amount = amount;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorted insert helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Compare two NaiveDates by value. Returns negative, 0, or positive. */
function compareDateValue(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/**
 * Find the index at which `inst` should be inserted to keep `sorted` ordered
 * by `effectiveRange.start` (binary search, O(log n)).
 */
function sortedInsertIndex(sorted: readonly BudgetInstance[], inst: BudgetInstance): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareDateValue(sorted[mid]!.effectiveRange.start, inst.effectiveRange.start) <= 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Insert `inst` into `sorted` at the correct position (by start date) and
 * validate that it does not overlap its immediate neighbours.
 *
 * Because the array is sorted, only the left and right neighbours need to be
 * checked — O(1) overlap checks instead of O(n).
 *
 * @throws {RangeError} if `inst` overlaps a neighbour.
 */
export function sortedInsert(sorted: readonly BudgetInstance[], inst: BudgetInstance): BudgetInstance[] {
  const idx = sortedInsertIndex(sorted, inst);

  const left  = sorted[idx - 1];
  const right = sorted[idx];

  if (left !== undefined && overlap(left.effectiveRange, inst.effectiveRange) !== null) {
    throw new RangeError(
      `New budget instance overlaps the preceding instance (index ${idx - 1}).`,
    );
  }
  if (right !== undefined && overlap(inst.effectiveRange, right.effectiveRange) !== null) {
    throw new RangeError(
      `New budget instance overlaps the following instance (index ${idx}).`,
    );
  }

  return [...sorted.slice(0, idx), inst, ...sorted.slice(idx)];
}

/**
 * Sort `budgets` by start date and validate that no two are overlapping.
 * Used by the constructor to canonicalise an arbitrary input array.
 *
 * @throws {RangeError} on the first detected overlap (after sorting).
 */
export function sortAndValidate(budgets: readonly BudgetInstance[]): BudgetInstance[] {
  const sorted = [...budgets].sort((a, b) =>
    compareDateValue(a.effectiveRange.start, b.effectiveRange.start),
  );
  // After sorting, only adjacent pairs can overlap.
  for (let i = 0; i < sorted.length - 1; i++) {
    if (overlap(sorted[i]!.effectiveRange, sorted[i + 1]!.effectiveRange) !== null) {
      throw new RangeError(
        `Budget instances at sorted positions ${i} and ${i + 1} have overlapping date ranges.`,
      );
    }
  }
  return sorted;
}
