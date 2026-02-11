import { useMemo } from 'react';
import { calculateMonthlySpent } from '../lib/budgetCalculations';
import type { BudgetAllocation, StandardBudgetOutput } from '../lib/types';
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
 * Intermediate tree structure before business logic is applied
 */
interface RawTreeNode {
  name: string;
  children: Map<string, RawTreeNode>;
  budget?: StandardBudgetOutput;
  fullPath?: string;
}

/**
 * Step 1: Build a raw tree structure from flat budget paths
 * Pure function - just builds hierarchy, no calculations or colors
 */
function buildBudgetTree(budgets: StandardBudgetOutput[]): RawTreeNode {
  const root: RawTreeNode = {
    name: 'Budget',
    children: new Map()
  };

  budgets.forEach(budget => {
    const parts = budget.account.split(':');
    let current = root;

    parts.forEach((part, index) => {
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          children: new Map()
        });
      }
      current = current.children.get(part)!;

      // Mark as budget node if this is the final part
      if (index === parts.length - 1) {
        current.budget = budget;
        current.fullPath = budget.account;
      }
    });
  });

  return root;
}

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
        name: `${node.name} Unallocated`,
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
  const PALETTE = [
    '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3',
    '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'
  ];
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
  transactions: Transaction[]
): {
  data: CategoryNode;
  isLoading: boolean;
} {
  const data = useMemo(() => {
    // Filter to standard budgets only
    const standardBudgets = budgets.filter((b): b is StandardBudgetOutput =>
      'frequency' in b
    );

    // Calculate spending for current month
    const now = new Date();
    const spentAmounts = calculateMonthlySpent(
      transactions,
      standardBudgets,
      now.getFullYear(),
      now.getMonth()
    );

    // Three-step pipeline
    const rawTree = buildBudgetTree(standardBudgets);
    const { node: enrichedTree } = enrichWithSpending(rawTree, spentAmounts);
    const visualizationData = formatForSunburst(enrichedTree);

    return visualizationData;
  }, [budgets, transactions]);

  return {
    data,
    isLoading: false
  };
}
