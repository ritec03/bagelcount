import { useMemo } from "react";
import type { BudgetAllocation, StandardBudgetOutput } from "../lib/types";

interface ValidationResult {
  isValid: boolean;
  message: string | null;
  availableBudget: number | null;
}

export function useBudgetValidation(
  budgets: BudgetAllocation[] | undefined,
  account: string,
  amount: number,
  budgetType: "StandardBudget" | "CustomBudget"
): ValidationResult {
  return useMemo(() => {
    // Skip validation for CustomBudget or if missing data
    if (budgetType !== "StandardBudget" || !budgets || !account || !amount) {
      return { isValid: true, message: null, availableBudget: null };
    }

    const standardBudgets = budgets.filter(
      (b): b is StandardBudgetOutput => "frequency" in b
    );

    let availableBudget: number | null = null;

    // --- Child Check: Ensure we don't exceed Parent ---
    const parentName = account.split(':').slice(0, -1).join(':');
    if (parentName) {
      const parentBudget = standardBudgets.find(b => b.account === parentName);
      if (parentBudget) {
        // Calculate used by other siblings (exclude current account)
        const siblings = standardBudgets.filter(b =>
          b.account.startsWith(parentName + ":") &&
          b.account.split(':').length === parentName.split(':').length + 1 &&
          b.account !== account
        );

        const siblingsUsed = siblings.reduce((sum, b) => sum + parseFloat(String(b.amount)), 0);
        const available = parseFloat(String(parentBudget.amount)) - siblingsUsed;
        availableBudget = available;

        if (amount > available) {
          return {
            isValid: false,
            message: `Exceeds parent budget (${parentName}). Available: $${available.toFixed(2)}`,
            availableBudget: available,
          };
        }
      }
    }

    // --- Parent Check: Ensure we have enough for Children ---
    const children = standardBudgets.filter(b =>
      b.account.startsWith(account + ":") &&
      b.account.split(':').length === account.split(':').length + 1
    );

    if (children.length > 0) {
      const childrenSum = children.reduce((sum, b) => sum + parseFloat(String(b.amount)), 0);
      if (amount < childrenSum) {
        return {
          isValid: false,
          message: `Insufficient for sub-categories. Required: $${childrenSum.toFixed(2)}`,
          availableBudget: null,
        };
      }
    }

    return { isValid: true, message: null, availableBudget };
  }, [budgets, account, amount, budgetType]);
}
