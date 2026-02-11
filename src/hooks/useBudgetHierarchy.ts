import { useMemo } from 'react';
import type { BudgetAllocation, StandardBudgetOutput } from '@/lib/types';
import { buildBudgetTree, flattenBudgetTree, type HierarchyItem } from '@/lib/budgetTree';

/**
 * Hook to organize flat budget list into a hierarchical, sorted structure.
 * 
 * Returns a flat array of items that are ordered by hierarchy (DFS traversal),
 * with metadata for indentation level and color assignment.
 */
export function useBudgetHierarchy(
  budgets: BudgetAllocation[] 
): HierarchyItem[] {
  return useMemo(() => {
    // 1. Filter for Standard Budgets only (Hierarchy only supports expense/income tree)
    const standardBudgets = budgets.filter((b): b is StandardBudgetOutput => 
      'frequency' in b
    );

    // 2. Build the Raw Tree
    const root = buildBudgetTree(standardBudgets);

    // 3. Flatten the tree for rendering (includes coloring logic)
    const flattenedItems = flattenBudgetTree(root);

    return flattenedItems;
  }, [budgets]);
}
