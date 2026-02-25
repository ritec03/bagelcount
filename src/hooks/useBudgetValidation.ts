import { useMemo } from "react";
import type { StandardBudgetOutput } from "../lib/models/types";
import { createBudgetFacade } from "../lib/budgets/service/budgetManager";
import { CONSTRAINT_CONFIG } from "./useBudgetFacade";
import { formatMutationResult } from "../lib/budgets/constraints/constraintMessages";
import { normalizeBudgetAmount } from "../lib/budgetCalculations";

export interface AffectedChild {
  account: string;
  frequency: 'monthly' | 'quarterly' | 'yearly';
}

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
  warnings: string[];
  affectedChildren: AffectedChild[];
  availableBudget: number | null;
}

type BudgetFrequency = 'monthly' | 'quarterly' | 'yearly';

const EMPTY_RESULT: ValidationResult = {
  isValid: true,
  error: null,
  warnings: [],
  affectedChildren: [],
  availableBudget: null,
};

/**
 * React hook for real-time form validation using the BudgetFacade.
 *
 * Accepts `budgets` as either the extended list from `useBudgetFacade`
 * (preferred) or a raw `StandardBudgetOutput[]`.  A local facade is
 * built from these budgets and used to run `previewAddBudget` on every
 * keystroke, replacing the old hand-rolled validation logic.
 *
 * The returned `ValidationResult` shape is identical to the old hook so
 * that `BudgetForm` and `useBudgetListValidation` need no UI changes.
 */
export function useBudgetValidation(
  budgets: StandardBudgetOutput[] | undefined,
  account: string,
  amount: number,
  budgetType: "StandardBudget" | "CustomBudget",
  frequency?: BudgetFrequency,
  startDate?: string,
  budgetToEditId?: string,
): ValidationResult {
  // Step 1: build a stable facade keyed on the budgets themselves
  const facade = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;
    const f = createBudgetFacade();
    f.initializeBudgets(budgets, CONSTRAINT_CONFIG);
    return f;
  }, [budgets]);

  // Step 2: run the preview whenever any form input changes
  return useMemo(() => {
    if (
      budgetType !== "StandardBudget" ||
      !facade ||
      !account ||
      amount == null ||
      !frequency
    ) {
      return EMPTY_RESULT;
    }

    if (amount < 0) {
      return {
        isValid: false,
        error: 'Amount must be non-negative',
        warnings: [],
        affectedChildren: [],
        availableBudget: null,
      };
    }

    const dummyId = budgetToEditId ?? "__preview__";
    const dummyBudget: StandardBudgetOutput = {
      id: dummyId,
      account,
      amount: String(amount),
      start_date: startDate ?? new Date().toISOString().slice(0, 10),
      end_date: null,
      frequency,
    };

    try {
      const result = budgetToEditId 
        ? facade.previewUpdateBudget(budgetToEditId, dummyBudget)
        : facade.previewAddBudget(dummyBudget);

      if (!result.success) {
        console.log(result)
        const formatted = formatMutationResult(result.errors, result.warnings);
        // Compute availableBudget: best-effort from legacy logic for UX hint
        const availableBudget = budgets ? computeAvailableBudget(budgets, account, amount, frequency) : null;
        return {
          isValid: false,
          error: formatted.errors[0] ?? "Invalid budget.",
          warnings: formatted.warnings,
          affectedChildren: [],
          availableBudget,
        };
      }

      // Success but may still have warnings (e.g. over-allocating children)
      const selfUpdate = result.updates[dummyId];
      if (selfUpdate?.warnings) {
        const formatted = formatMutationResult({}, selfUpdate.warnings);
        if (formatted.warnings.length > 0) {
          return {
            isValid: true,
            error: null,
            warnings: formatted.warnings,
            affectedChildren: [],
            availableBudget: null,
          };
        }
      }

      return EMPTY_RESULT;
    } catch {
      // ignore transient parsing errors
      return EMPTY_RESULT;
    }
  }, [facade, account, amount, budgetType, frequency, startDate, budgets, budgetToEditId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the available budget under the parent for the given account /
 * frequency so we can still show the "Available: $X/freq" hint in the form.
 * This mirrors the legacy parent-check logic but only for the hint, not
 * for blocking — the facade handles correctness.
 */
function computeAvailableBudget(
  budgets: StandardBudgetOutput[],
  account: string,
  _amount: number,
  frequency: BudgetFrequency,
): number | null {
  const parentName = account.split(':').slice(0, -1).join(':');
  if (!parentName) return null;

  const frequencies: BudgetFrequency[] = ['monthly', 'quarterly', 'yearly'];
  const myFreqIndex = frequencies.indexOf(frequency);

  const standardBudgets = budgets;
  const parentBudgets = standardBudgets.filter(b => b.account === parentName);
  if (parentBudgets.length === 0) return null;

  const siblings = standardBudgets.filter(b =>
    b.account.startsWith(parentName + ":") &&
    b.account.split(':').length === parentName.split(':').length + 1 &&
    b.account !== account
  );

  const siblingsAnnualUsed = siblings.reduce(
    (sum, b) => sum + normalizeBudgetAmount(parseFloat(b.amount), b.frequency, 'yearly'),
    0,
  );

  let tightest: number | null = null;
  for (const parent of parentBudgets) {
    const parentAnnual = normalizeBudgetAmount(parseFloat(parent.amount), parent.frequency, 'yearly');
    const availableAnnual = parentAnnual - siblingsAnnualUsed;
    const avail = normalizeBudgetAmount(availableAnnual, 'yearly', frequency);

    if (tightest === null || avail < tightest) {
      const freqIdx = frequencies.indexOf(parent.frequency);
      if (freqIdx >= myFreqIndex) {
        // only count same-or-lower freq parents as hard constraints
        tightest = Math.max(0, avail);
      }
    }
  }

  return tightest;
}
