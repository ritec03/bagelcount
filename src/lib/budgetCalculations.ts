import type { Transaction } from './api/types.gen';
import type { BudgetAllocation, PeriodType, NormalizationMode } from './types';

/**
 * Calculate the total spent amount for each budget account within a specific period.
 * 
 * Supports 'monthly' (filters by year and month) and 'yearly' (filters by year) periods.
 * 
 * @param transactions - Array of all transactions to analyze
 * @param budgets - Array of budget allocations to track spending against
 * @param periodType - 'monthly' or 'yearly'
 * @param date - Date object determining the target period (uses month/year from this date)
 * @returns Map of account names to their total spent amounts
 */
export function calculatePeriodSpent(
  transactions: Transaction[],
  budgets: BudgetAllocation[],
  periodType: PeriodType,
  date: Date
): Map<string, number> {
  const amounts = new Map<string, number>();
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth();

  transactions.forEach(tx => {
    // Validate date format (YYYY-MM-DD) to ensure safe parsing
    // This strictly enforces ISO 8601 date part only, ignoring time/timezone
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      throw new Error(`Invalid date format: ${tx.date}. Expected YYYY-MM-DD.`);
    }

    // Safe to split and parse integers after validation
    const [txYearStr, txMonthStr] = tx.date.split('-');
    const txYear = parseInt(txYearStr, 10);
    const txMonth = parseInt(txMonthStr, 10) - 1; // 0-indexed

    if (txYear !== targetYear) {
        return;
    }
    
    // For monthly period, check month as well
    // TODO add quarterly support
    if (periodType === 'monthly' && txMonth !== targetMonth) {
        return;
    }

    // Skip transactions without postings
    if (!tx.postings) return;

    tx.postings.forEach(posting => {
      // For each budget, check if this posting matches
      budgets.forEach(budget => {
        const accountName = budget.account;
        
        // Match exact account or hierarchical children (e.g., "Expenses:Food:Restaurants" matches "Expenses:Food")
        const isExactMatch = posting.account === accountName;
        const isChildAccount = posting.account.startsWith(accountName + ":");
        
        if (isExactMatch || isChildAccount) {
          // Parse amount from units string (e.g., "50.00 CAD" -> 50.00)
          const amountStr = posting.units.split(' ')[0];
          const amount = parseFloat(amountStr);
          
          // Only accumulate valid numbers
          if (!isNaN(amount)) {
            amounts.set(accountName, (amounts.get(accountName) || 0) + amount);
          }
        }
      });
    });
  });

  return amounts;
}

/**
 * Calculate the total spent amount for each budget account within a specific month.
 * Wrapper around calculatePeriodSpent for backward compatibility.
 */
export function calculateMonthlySpent(
  transactions: Transaction[],
  budgets: BudgetAllocation[],
  targetYear: number,
  targetMonth: number
): Map<string, number> {
  return calculatePeriodSpent(transactions, budgets, 'monthly', new Date(targetYear, targetMonth, 1));
}

/**
 * Normalize a budget amount from one frequency to another.
 * Uses annual amount as an intermediate representation for any-to-any conversion.
 */
export function normalizeBudgetAmount(
  amount: number,
  budgetFrequency: PeriodType,
  viewPeriod: PeriodType
): number {
  if (budgetFrequency === viewPeriod) return amount;

  // Step 1: Convert to annual
  const annualMultipliers: Record<string, number> = { monthly: 12, quarterly: 4, yearly: 1 };
  const annual = amount * annualMultipliers[budgetFrequency];

  // Step 2: Convert from annual to target
  return annual / annualMultipliers[viewPeriod];
}

/**
 * Filter budgets based on the current period type (or 'custom'), normalization mode, and view date.
 * 
 * Logic:
 * - 'custom': Returns only Custom Budgets (Project budgets) that overlap with the view date.
 * - 'monthly'/'yearly': Returns only Standard Budgets with matching frequency that are active on the view date.
 * 
 * @param budgets - List of all budgets
 * @param periodTypeOrCustom - The active view mode: 'monthly', 'yearly', or 'custom'
 * @param mode - Normalization mode (currently unused for filtering logic but kept for API consistency if needed later)
 * @param date - The reference date for overlap checks
 */
export function filterBudgetsByMode(
  budgets: BudgetAllocation[],
  periodTypeOrCustom: PeriodType | 'custom',
  _mode: NormalizationMode,
  date: Date
): BudgetAllocation[] {
  return budgets.filter(b => {
    // Check 1: Distinguish Budget Type
    const isStandard = 'frequency' in b;
    const isCustom = !isStandard; // Custom/Project budgets don't have frequency

    // Filter by Type
    if (periodTypeOrCustom === 'custom') {
        if (!isCustom) return false;
        
        // Custom Check: Date Overlap
        // Active if: start_date <= date <= end_date
        const startDate = new Date(b.start_date);
        const endDate = new Date(b.end_date);
        
        // Simple overlap check: 
        // We look at specific point in time 'date' (e.g., first of month).
        // Is this budget active during this time?
        return date >= startDate && date <= endDate;
    } else {
        // Standard Mode ('monthly' or 'yearly')
        if (!isStandard) return false;
        
        // strict frequency match
        if (b.frequency !== periodTypeOrCustom) return false;

        // Standard Check: Active Start Date
        // Active if: start_date <= date
        // Standard budgets typically run indefinitely until cancelled/replaced, 
        // so we mainly check they have started.
        const startDate = new Date(b.start_date);
        return date >= startDate;
    }
  });
}
