import { useMemo } from 'react';
import { useTransactions } from './useTransactions';
import { calculatePeriodSpent } from '../lib/budgetCalculations';
import type { BudgetAllocation } from '../lib/types';

/**
 * Custom hook that calculates spent amounts for budget accounts in the current month.
 * 
 * This hook fetches all transactions, determines the current month/year, and uses
 * the `calculateMonthlySpent` utility function to compute spending. Results are
 * memoized to avoid unnecessary recalculations.
 * 
 * @param budgets - Array of budget allocations to track spending against
 * @returns Map of account names to their total spent amounts for the current month
 * 
 * @example
 * ```typescript
 * function BudgetList({ budgets }: Props) {
 *   const spentAmounts = useBudgetSpentAmounts(budgets);
 *   
 *   return budgets.map(budget => (
 *     <div key={budget.account}>
 *       Spent: ${spentAmounts.get(budget.account) || 0}
 *     </div>
 *   ));
 * }
 * ```
 */
export function useBudgetSpentAmounts(
  budgets: BudgetAllocation[],
  viewDate: Date,
  periodType: 'monthly' | 'yearly'
): Map<string, number> {
  const { transactions } = useTransactions();

  return useMemo(() => {
    return calculatePeriodSpent(transactions, budgets, periodType, viewDate);
  }, [transactions, budgets, viewDate, periodType]);
}
