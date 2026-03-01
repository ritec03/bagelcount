/**
 * Extensible, registry-based formatter that converts a raw
 * `ConstraintViolationMap` into human-readable strings for the UI.
 *
 * ## How to add a new constraint
 * 1. Add the constraint to the `ConstraintRegistry` in `constraints.ts`.
 * 2. Add a matching entry to `constraintFormatters` below.
 * 3. That's it — the `formatViolations` utility picks it up automatically.
 *
 * ## Role semantics
 * Each constraint can emit violations for different **roles** (e.g. the
 * violating budget itself vs. the budget that is affected by the violation).
 * The formatter is called once per violation object.
 */

import type {
  Constraint,
  ConstraintViolationMap,
  ConstraintRegistry,
} from './constraints';
// ─────────────────────────────────────────────────────────────────────────────
// Formatter registry type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single formatter entry for one constraint key.
 * It receives the raw violation object (typed by the registry) and returns a
 * human-readable message string.
 */
type ConstraintFormatter<K extends Constraint> = (
  violation: ConstraintRegistry[K]['Warning'],
) => string;

/**
 * The full formatter registry — one entry per `Constraint` key.
 * TypeScript will error here if a newly added constraint has no formatter.
 */
const constraintFormatters: {
  [K in Constraint]: ConstraintFormatter<K>;
} = {
  // ── ParentChildrenSum ───────────────────────────────────────────────────
  // Violations already carry a `message` field written by the checker, so we
  // surface it directly.  Fall back to a generic string for safety.
  ParentChildrenSum: (v) =>
    v.message ||
    (v.role === 'parent'
      ? 'Children budgets exceed this budget.'
      : 'This budget exceeds its parent.'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface FormattedViolations {
  /** Human-readable warning messages (non-blocking). */
  warnings: string[];
  /** Human-readable error messages (blocking). */
  errors: string[];
}

/**
 * Convert a `ConstraintViolationMap` for a single budget into two flat string
 * arrays that the UI can render directly.
 *
 * Because the facade splits violations into `errors` vs `warnings` only on
 * mutation results, here we treat **all** violations in the map as warnings
 * (the typical case for the list view).  Use `formatMutationResult` when
 * processing `OperationResult` payloads that already separate errors/warnings.
 */
export function formatViolationWarnings(
  violations: ConstraintViolationMap,
): string[] {
  const messages: string[] = [];

  for (const key of Object.keys(violations) as Constraint[]) {
    const items = violations[key];
    if (!items) continue;
    const fmt = constraintFormatters[key] as ConstraintFormatter<typeof key>;
    for (const v of items) {
      messages.push(fmt(v));
    }
  }

  return messages;
}

/**
 * Convert a pair of `ConstraintViolationMap`s (errors + warnings) from an
 * `OperationResult` into a `FormattedViolations` object ready for the UI.
 */
export function formatMutationResult(
  errors: ConstraintViolationMap,
  warnings: ConstraintViolationMap,
): FormattedViolations {
  return {
    errors: formatViolationWarnings(errors),
    warnings: formatViolationWarnings(warnings),
  };
}
