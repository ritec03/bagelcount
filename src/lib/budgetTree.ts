import type { StandardBudgetOutput, BudgetAllocation } from './types';
import { generateVibrantColor } from './colorUtils';

// ============================================================================
// Types
// ============================================================================

export interface RawTreeNode {
  name: string;
  children: Map<string, RawTreeNode>;
  budget?: StandardBudgetOutput;
  fullPath?: string;
}

export interface HierarchyItem {
  budget?: BudgetAllocation;
  name: string;
  color?: string;
  level: number;
  path: string;
  isGroup: boolean;
  fullPath: string;
}

// ============================================================================
// Tree Building (Pure Logic)
// ============================================================================

/**
 * Step 1: Build a raw tree structure from flat budget paths
 */
export function buildBudgetTree(budgets: StandardBudgetOutput[]): RawTreeNode {
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

// ============================================================================
// Coloring Logic
// ============================================================================

// [Removed unused helper functions: getCategoryColor, generateColorMap]
// The color assignment logic is embedded directly in the traversal functions 
// (formatForSunburst in useBudgetSunburstData, and flattenBudgetTree below)
// to ensure consistency with traversal order.

// ============================================================================
// Flattening Logic (Comparison to List)
// ============================================================================

/**
 * Flattens the budget tree into a list for rendering.
 * Sorted alphabetically within groups.
 */
export function flattenBudgetTree(
    root: RawTreeNode, 
    // colorMap?: Map<string, string> // Optional, but recommended for colors
): HierarchyItem[] {
  const items: HierarchyItem[] = [];
  // Use a shared color index if map not provided (less consistent but fallback)
  let colorIdx = 0; 

  function traverse(node: RawTreeNode, level: number, parentColor?: string, currentPath: string = '') {
     // Determine color
     let myColor = parentColor;
     if (level === 2 && !myColor) {
         myColor = generateVibrantColor(colorIdx++);
     }

     // If this node represents a budget, add it
     if (node.budget) {
         items.push({
             budget: node.budget,
             name: node.name,
             color: myColor || '#ccc',
             level: level - 1, // Adjust for UI (Root is hidden)
             path: currentPath,
             isGroup: node.children.size > 0,
             fullPath: node.fullPath || currentPath
         });
     }

     // Sort children alphabetically
     const sortedChildren = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));

     sortedChildren.forEach(child => {
         const childPath = currentPath ? `${currentPath}:${child.name}` : child.name;
         traverse(child, level + 1, myColor, childPath);
     });
  }

  // Start traversal from root's children (skip "Budget" root wrapper)
  // Ensure we sort top-level (Expenses, Income) too
  const sortedRoots = Array.from(root.children.values()).sort((a, b) => a.name.localeCompare(b.name));
  
  // Reset generic counter if used
  colorIdx = 0;
  
  sortedRoots.forEach(child => {
      traverse(child, 1, undefined, child.name);
  });

  return items;
}
