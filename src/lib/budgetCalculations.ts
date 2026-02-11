import type { Transaction } from './api/types.gen';
import type { BudgetAllocation } from './types';

/**
 * Calculate the total spent amount for each budget account within a specific month.
 * 
 * This function filters transactions by the target year and month, then aggregates
 * spending amounts for each budget account. It supports hierarchical account matching,
 * meaning a budget for "Expenses:Food" will include transactions from both
 * "Expenses:Food" and child accounts like "Expenses:Food:Restaurants".
 * 
 * @param transactions - Array of all transactions to analyze
 * @param budgets - Array of budget allocations to track spending against
 * @param targetYear - The year to filter transactions (e.g., 2026)
 * @param targetMonth - The month to filter transactions (0-indexed, 0 = January)
 * @returns Map of account names to their total spent amounts
 * 
 * @example
 * ```typescript
 * const spent = calculateMonthlySpent(
 *   transactions,
 *   budgets,
 *   2026,
 *   0  // January
 * );
 * console.log(spent.get('Expenses:Food')); // 125.50
 * ```
 */
export function calculateMonthlySpent(
  transactions: Transaction[],
  budgets: BudgetAllocation[],
  targetYear: number,
  targetMonth: number
): Map<string, number> {
  const amounts = new Map<string, number>();

  transactions.forEach(tx => {
    // Filter by target year and month
    const txDate = new Date(tx.date);
    if (txDate.getFullYear() !== targetYear || txDate.getMonth() !== targetMonth) {
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
