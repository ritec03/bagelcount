
// ─────────────────────────────────────────────────────────────────────────────
// AccountLabel – branded segment array
// ─────────────────────────────────────────────────────────────────────────────

import { PERIOD_TYPES, type PeriodType } from "@/lib/models/types";

declare const accountLabelBrand: unique symbol;

/**
 * A non-empty, pre-segmented Beancount account label.
 *
 * Use {@link makeAccountLabel} to construct one from a raw colon-separated
 * string. The brand prevents accidental use of plain `string[]` values.
 *
 * @example
 * const lbl = makeAccountLabel('Expenses:Food:Restaurants');
 * // lbl → ['Expenses', 'Food', 'Restaurants']
 */
export type AccountLabel = readonly [string, ...string[]] & {
  readonly [accountLabelBrand]: true;
};

/**
 * Parse a colon-separated Beancount account string into an {@link AccountLabel}.
 *
 * @throws {Error} if `raw` is empty or contains an empty segment.
 */
export function makeAccountLabel(raw: string): AccountLabel {
  const segments = raw.split(':');
  if (segments.length === 0 || segments.some((s) => s.length === 0)) {
    throw new Error(
      `Invalid account label "${raw}": must be non-empty and contain no empty segments.`,
    );
  }
  return segments as unknown as AccountLabel;
}

/** Compare two AccountLabels structurally, segment by segment. */
export function labelEquals(a: AccountLabel, b: AccountLabel): boolean {
  return a.length === b.length && a.every((seg, i) => seg === b[i]);
}

/** Join an {@link AccountLabel} back to its colon-separated string form. */
export function labelToString(lbl: AccountLabel): string {
  return lbl.join(':');
}

/**
 * Return the last segment of a label that is NOT a period-type keyword.
 *
 * In the unified tree, labels look like `[..., 'Food', 'yearly', 'quarterly', 'monthly']`.
 * Walking backward past the period segments gives us the real account name (`'Food'`).
 */
export function accountNameFromLabelExcludingFrequency(label: AccountLabel): string {
  for (let i = label.length - 1; i >= 0; i--) {
    if (!PERIOD_TYPES.has(label[i] as PeriodType)) return label[i]!;
  }
  return label[0] ?? '';
}