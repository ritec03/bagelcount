import type { PeriodType } from '@/lib/models/types';

// ─────────────────────────────────────────────────────────────────────────────
// Period scale helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How many times each period fits into a year.
 * Used to scale amounts between different frequencies.
 */
const PERIOD_MULTIPLIER: Record<PeriodType, number> = {
  yearly:    1,
  quarterly: 4,
  monthly:   12,
};

/**
 * Return the factor by which a `from`-frequency amount must be multiplied
 * to express it in `to`-frequency terms.
 *
 * Examples:
 *   periodScaleFactor('monthly',   'yearly')    → 12   (monthly × 12 = yearly)
 *   periodScaleFactor('quarterly', 'yearly')    → 4
 *   periodScaleFactor('monthly',   'quarterly') → 3
 *   periodScaleFactor('yearly',    'monthly')   → 1/12 (yearly ÷ 12 = monthly)
 *   periodScaleFactor('yearly',    'yearly')    → 1
 */
export function periodScaleFactor(from: PeriodType, to: PeriodType): number {
  return PERIOD_MULTIPLIER[from] / PERIOD_MULTIPLIER[to];
}
