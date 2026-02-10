import { useMemo } from 'react';
import type { BudgetAllocation, PeriodType, NormalizationMode, StandardBudgetOutput } from '@/lib/types';
import {
  calculatePeriodSpent,
  normalizeBudgetAmount,
  filterBudgetsByMode
} from '@/lib/budgetCalculations';
import { buildBudgetTree, PALETTE, type RawTreeNode } from '@/lib/budgetTree';
import type { Transaction } from '../lib/api/types.gen';

// Sunburst Chart Node Types - Discriminated Union

// Base properties shared by all node types
type BaseNode = {
  name: string;
  color?: string;
  children?: SunburstNode[];
};

/**
 * Grouping/Category nodes (e.g., "Expenses", "Income")
 * These nodes aggregate budget and spent values from their children
 */
export type CategoryNode = BaseNode & {
  type: 'category';
  totalBudget: number;
  totalSpent: number;
};

/**
 * Explicit budget item nodes (leaf or intermediate nodes with budgets)
 * Represents a specific budget allocation with spending tracked
 */
export type BudgetNode = BaseNode & {
  type: 'budget';
  budgeted: number;
  spent: number;
  fullPath: string;  // Full account path for transaction matching
  value?: number;    // For Nivo sizing (optional, calculated from budgeted)
};

/**
 * Spacer nodes for unallocated/remainder budget visualization
 * These are invisible nodes used to represent the difference between
 * parent budget and sum of children budgets
 */
export type SpacerNode = BaseNode & {
  type: 'spacer';
  value: number;     // Size of unallocated budget
};

/**
 * Discriminated Union of all possible sunburst node types
 * Use type guards (e.g., `node.type === 'budget'`) to access type-specific properties
 */
export type SunburstNode = CategoryNode | BudgetNode | SpacerNode;


// ============================================================================
// Pure Helper Functions (Testable, No Side Effects)
// ============================================================================

/**
 * Step 2: Enrich tree with spending data and calculate totals
 * Pure function - takes raw tree, returns tree with numbers
 */
function enrichWithSpending(
  node: RawTreeNode,
  spentAmounts: Map<string, number>
): { node: SunburstNode; totalBudget: number; totalSpent: number } {
  // Process children first (bottom-up)
  const enrichedChildren: SunburstNode[] = [];
  let childrenBudgetSum = 0;
  let childrenSpentSum = 0;

  // Process children (use .values() for clarity with Map iteration)
  for (const child of node.children.values()) {
    const enriched = enrichWithSpending(child, spentAmounts);
    enrichedChildren.push(enriched.node);
    childrenBudgetSum += enriched.totalBudget;
    childrenSpentSum += enriched.totalSpent;
  }

  // If this node has an explicit budget
  if (node.budget && node.fullPath) {
    const budgeted = parseFloat(node.budget.amount as string);
    const spent = spentAmounts.get(node.fullPath) || 0;
    const remainder = Math.max(0, budgeted - childrenBudgetSum);

    // Add spacer for unallocated budget
    const children: SunburstNode[] = [...enrichedChildren];
    if (remainder > 0) {
      children.push({
        type: 'spacer',
        name: 'Unallocated',
        value: remainder,
        color: 'transparent'
      });
    }

    const budgetNode: BudgetNode = {
      type: 'budget',
      name: node.name,
      budgeted,
      spent,
      fullPath: node.fullPath,
      value: budgeted,
      children: children.length > 0 ? children : undefined
    };

    return {
      node: budgetNode,
      totalBudget: Math.max(budgeted, childrenBudgetSum), // Show actual allocation (handles over-allocation)
      totalSpent: spent
    };
  }

  // Category node (no explicit budget)
  const categoryNode: CategoryNode = {
    type: 'category',
    name: node.name,
    totalBudget: childrenBudgetSum,
    totalSpent: childrenSpentSum,
    children: enrichedChildren // Always include children array (may be empty)
  };

  return {
    node: categoryNode,
    totalBudget: childrenBudgetSum,
    totalSpent: childrenSpentSum
  };
}

/**
 * Step 3: Apply presentation logic - colors and final formatting
 * Pure function - takes enriched tree, returns visualization-ready data
 */
function formatForSunburst(node: SunburstNode): CategoryNode {
  let colorIdx = 0;

  // Assign colors to level-2 nodes (e.g., Food, Transport under Expenses)
  const assignColors = (current: SunburstNode, level: number): SunburstNode => {
    if (current.type === 'spacer') return current;

    if (level === 2 && !current.color) {
      current.color = PALETTE[colorIdx++ % PALETTE.length];
    }

    if (current.children) {
      current.children = current.children.map(child =>
        assignColors(child, level + 1)
      );
    }

    return current;
  };

  // Propagate colors down the tree
  const propagateColors = (current: SunburstNode, parentColor?: string): SunburstNode => {
    if (current.type === 'spacer') return current;

    if (!current.color && parentColor) {
      current.color = parentColor;
    }

    if (current.children) {
      current.children = current.children.map(child =>
        propagateColors(child, current.color)
      );
    }

    return current;
  };

  // Apply colors
  let result = assignColors(node, 0);
  result = propagateColors(result);

  // Set root as transparent
  if (result.type === 'category' && result.name === 'Budget') {
    result.color = 'rgba(255, 255, 255, 0)';
  }

  return result as CategoryNode;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Custom hook that transforms budget allocations and transactions into a
 * hierarchical tree structure for sunburst chart visualization.
 * 
 * Simple 3-step pipeline:
 * 1. Build raw tree from budget paths
 * 2. Enrich with spending calculations
 * 3. Format with colors for visualization
 */
export function useBudgetSunburstData(
  budgets: BudgetAllocation[],
  transactions: Transaction[],
  viewDate: Date,
  periodType: PeriodType,
  normalizationMode: NormalizationMode
): {
  data: CategoryNode;
  isLoading: boolean;
} {
  const data = useMemo(() => {
    // Filter to standard budgets only
    const standardBudgets = budgets.filter((b): b is StandardBudgetOutput =>
      'frequency' in b
    );

    // Use shared filtering utility
    const filteredBudgets = filterBudgetsByMode(standardBudgets, periodType, normalizationMode, viewDate);

    // Normalize budget amounts based on view and mode
    const normalizedBudgets = filteredBudgets.map(b => {
      let amount = parseFloat(b.amount as string);
      
      if (normalizationMode === 'pro-rated' && 'frequency' in b) {
        amount = normalizeBudgetAmount(amount, b.frequency, periodType);
      }
      
      return { ...b, amount: amount.toString() };
    });

    // Build the category tree
    // We need to cast normalizedBudgets to StandardBudgetOutput[] because the tree building
    // logic expects standard budgets (with frequency).
    // TODO: Support custom budgets in tree if needed, for now filter valid ones.
    const validBudgets = normalizedBudgets.filter((b): b is StandardBudgetOutput => 'frequency' in b);
    
    // Calculate spending for selected period
    const spentAmounts = calculatePeriodSpent(
      transactions,
      standardBudgets, // Pass original budgets to match accounts, logic matches by name
      periodType,
      viewDate
    );

    // Three-step pipeline
    const rawTree = buildBudgetTree(validBudgets);
    const { node: enrichedTree } = enrichWithSpending(rawTree, spentAmounts);
    const visualizationData = formatForSunburst(enrichedTree);

    return visualizationData;
  }, [budgets, transactions, viewDate, periodType, normalizationMode]);

  return {
    data,
    isLoading: false
  };
}
