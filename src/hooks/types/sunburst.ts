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
