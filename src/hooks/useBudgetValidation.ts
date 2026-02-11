import { useMemo } from "react";
import type { BudgetAllocation, StandardBudgetOutput } from "../lib/types";
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

/** Parse the string-typed amount from a StandardBudgetOutput into a number. */
function parseBudgetAmount(budget: StandardBudgetOutput): number {
  return parseFloat(budget.amount);
}

/** Convert any amount + frequency to an Annual amount for standardized comparison. */
function toAnnual(amount: number, frequency: BudgetFrequency): number {
  return normalizeBudgetAmount(amount, frequency, 'yearly');
}

/** Convert an Annual amount back to a specific frequency for display. */
function fromAnnual(annualAmount: number, frequency: BudgetFrequency): number {
  return normalizeBudgetAmount(annualAmount, 'yearly', frequency);
}

/**
 * Pure validation logic, decoupled from React hooks.
 *
 * Validates a budget against three rules:
 * 1. Same-Account Consistency (Blocking) — annual amount must not exceed other frequencies
 * 2. Parent Check (Blocking) — annual amount must fit within parent limits
 * 3. Child Check (Warning) — annual amount should cover children needs
 */
export function validateBudget(
  budgets: BudgetAllocation[] | undefined,
  account: string,
  amount: number,
  frequency: BudgetFrequency | undefined,
  budgetType: "StandardBudget" | "CustomBudget"
): ValidationResult {
    // Skip if missing data or Custom Budget
    if (budgetType !== "StandardBudget" || !budgets || !account || amount == null || !frequency) {
      return { 
        isValid: true, 
        error: null, 
        warnings: [], 
        affectedChildren: [], 
        availableBudget: null 
      };
    }

    // Reject negative amounts — no domain validity
    if (amount < 0) {
      return {
        isValid: false,
        error: 'Amount must be non-negative',
        warnings: [],
        affectedChildren: [],
        availableBudget: null
      };
    }

    const standardBudgets = budgets.filter(
      (b): b is StandardBudgetOutput => "frequency" in b
    );

    let error: string | null = null;
    let availableBudget: number | null = null;
    const warnings: string[] = [];
    const affectedChildren: AffectedChild[] = [];
    const myAnnualAmount = toAnnual(amount, frequency);

    // --- 1. Same-Account Consistency Check (Blocking) ---
    // Frequency hierarchy: monthly(0) > quarterly(1) > yearly(2)
    // Rule A: Higher-frequency budget BLOCKED by lower-frequency budget (monthly can't exceed yearly's annual).
    // Lower-frequency exceeding higher-frequency is the normal case (more room at yearly level) — no action needed.
    // The reverse (yearly < monthly*12) is caught by the child check in Section 3.
    const frequencies: BudgetFrequency[] = ['monthly', 'quarterly', 'yearly'];
    const myFreqIndex = frequencies.indexOf(frequency);

    const sameAccountBudgets = standardBudgets.filter(b => 
      b.account === account && 
      b.frequency !== frequency
    );

    for (const otherBudget of sameAccountBudgets) {
      const otherAnnual = toAnnual(parseBudgetAmount(otherBudget), otherBudget.frequency);
      const otherFreqIndex = frequencies.indexOf(otherBudget.frequency);

      // Only block when I'm higher frequency exceeding a lower frequency budget
      if (myAnnualAmount > otherAnnual && myFreqIndex < otherFreqIndex) {
        const availableInMyFreq = fromAnnual(otherAnnual, frequency);
        availableBudget = Math.max(0, availableInMyFreq);
        error = `Exceeds budget set by other period (${otherBudget.frequency}). Available: $${availableBudget.toFixed(2)}/${frequency}`;
        return { isValid: false, error, warnings, affectedChildren, availableBudget };
      }
    }

    // --- 2. Parent Check ---
    // Rule B: My Annual Amount must be <= (Parent Annual - Siblings Annual Usage)
    // Directional: Same-or-lower-frequency parents BLOCK. Higher-frequency parents only WARN
    // as a fallback when no relevant (same/lower-freq) parent exists for the account.
    const parentName = account.split(':').slice(0, -1).join(':');
    
    if (parentName) {
      const parentBudgets = standardBudgets.filter(b => b.account === parentName);

      // Partition parents: relevant = same/lower freq, higher = higher freq
      const relevantParents = parentBudgets.filter(b => frequencies.indexOf(b.frequency) >= myFreqIndex);
      const higherFreqParents = parentBudgets.filter(b => frequencies.indexOf(b.frequency) < myFreqIndex);

      // Use relevant parents if available, otherwise fall back to higher-freq parents (warn only)
      const parentsToCheck = relevantParents.length > 0 ? relevantParents : higherFreqParents;
      const shouldBlock = relevantParents.length > 0;

      const siblings = standardBudgets.filter(b =>
        b.account.startsWith(parentName + ":") &&
        b.account.split(':').length === parentName.split(':').length + 1 &&
        b.account !== account
      );

      const siblingsAnnualUsed = siblings.reduce((sum, b) => 
        sum + toAnnual(parseBudgetAmount(b), b.frequency), 
      0);

      for (const parentBudget of parentsToCheck) {
          const parentAnnualLimit = toAnnual(parseBudgetAmount(parentBudget), parentBudget.frequency);
          const availableAnnual = parentAnnualLimit - siblingsAnnualUsed;

          if (myAnnualAmount > availableAnnual) {
            if (shouldBlock) {
              // Same-or-lower-frequency parent → BLOCK
              const availableInMyFreq = fromAnnual(availableAnnual, frequency);
              availableBudget = Math.max(0, availableInMyFreq);
              error = `Exceeds parent budget (${parentName}). Available: $${availableBudget.toFixed(2)}/${frequency}`;
              break; 
            } else {
              // Higher-frequency parent (fallback, no relevant parent exists) → WARN
              const parentInMyFreq = fromAnnual(parentAnnualLimit, frequency);
              warnings.push(
                `Exceeds ${parentBudget.frequency} parent budget (${parentName}, $${parentInMyFreq.toFixed(2)}/${frequency} equivalent). Consider updating it.`
              );
            }
          } else {
              // Track the tightest constraint across multiple parent budgets
              const avail = fromAnnual(availableAnnual, frequency);
              if (availableBudget === null || avail < availableBudget) {
                  availableBudget = avail;
              }
          }
      }
    }

    // --- 3. Child Check (Warning) ---
    // HIERARCHY RULE: 
    // If a same-account budget with higher frequency exists (e.g. Monthly for a Yearly budget),
    // validate against it instead of direct sub-accounts (it is the "authoritative child").
    
    const sameAccountConstraints = standardBudgets.filter(b => 
        b.account === account && 
        frequencies.indexOf(b.frequency) < myFreqIndex
    );

    if (sameAccountConstraints.length > 0) {
        const maxConstraint = sameAccountConstraints.reduce((prev, curr) => {
            const annual = toAnnual(parseBudgetAmount(curr), curr.frequency);
            return annual > prev.amount ? { amount: annual, budget: curr } : prev;
        }, { amount: 0, budget: sameAccountConstraints[0] });

        if (myAnnualAmount < maxConstraint.amount) {
             const shortfallAnnual = maxConstraint.amount - myAnnualAmount;
             const shortfallInMyFreq = fromAnnual(shortfallAnnual, frequency);
             
             affectedChildren.push({ account: maxConstraint.budget.account, frequency: maxConstraint.budget.frequency });
             warnings.push(
                `Your ${maxConstraint.budget.frequency} budget for this account totals $${maxConstraint.amount.toFixed(2)}/yr. You need an additional $${shortfallInMyFreq.toFixed(2)}/${frequency} to cover it.`
             );
        }

    } else {
        const children = standardBudgets.filter(b =>
          b.account.startsWith(account + ":") &&
          b.account.split(':').length === account.split(':').length + 1
        );
    
        if (children.length > 0) {
          const childrenAnnualNeed = children.reduce((sum, b) => 
            sum + toAnnual(parseBudgetAmount(b), b.frequency), 
          0);
    
          if (myAnnualAmount < childrenAnnualNeed) {
            children.forEach(c => affectedChildren.push({ account: c.account, frequency: c.frequency }));
            
            const shortfallAnnual = childrenAnnualNeed - myAnnualAmount;
            const shortfallInMyFreq = fromAnnual(shortfallAnnual, frequency);
    
            warnings.push(
              `Sub-categories total $${childrenAnnualNeed.toFixed(2)}/yr. You need an additional $${shortfallInMyFreq.toFixed(2)}/${frequency} to cover them.`
            );
          }
        }
    }

    return { 
      isValid: error === null, 
      error, 
      warnings, 
      affectedChildren, 
      availableBudget 
    };
}

export function useBudgetValidation(
  budgets: BudgetAllocation[] | undefined,
  account: string,
  amount: number,
  budgetType: "StandardBudget" | "CustomBudget",
  frequency?: BudgetFrequency
): ValidationResult {
  return useMemo(() => {
    return validateBudget(budgets, account, amount, frequency, budgetType);
  }, [budgets, account, amount, budgetType, frequency]);
}
