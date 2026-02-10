import { useMemo } from "react";
import type { BudgetAllocation, StandardBudgetOutput } from "../lib/types";
import { validateBudget, type ValidationResult } from "./useBudgetValidation";

/**
 * Pre-computes validation results for all standard budgets in a single memoized pass.
 *
 * Replaces inline validateBudget() calls inside render loops (O(n²) per render)
 * with a single O(n) pass that returns a Map keyed by `account:frequency`.
 */
export function useBudgetListValidation(
  budgets: BudgetAllocation[] | undefined
): Map<string, ValidationResult> {
  return useMemo(() => {
    const results = new Map<string, ValidationResult>();
    if (!budgets) return results;

    for (const budget of budgets) {
      if (!("frequency" in budget)) continue;

      const standardBudget = budget as StandardBudgetOutput;
      const key = `${standardBudget.account}:${standardBudget.frequency}`;

      const result = validateBudget(
        budgets,
        standardBudget.account,
        parseFloat(standardBudget.amount),
        standardBudget.frequency,
        "StandardBudget"
      );

      results.set(key, result);
    }

    return results;
  }, [budgets]);
}
