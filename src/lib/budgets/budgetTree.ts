import type { AccountLabel } from "./accountLabel";
import type { BudgetInstance } from "./budgetInstance";
import { deleteBudget, insertBudget, BudgetTreeNode } from "./budgetNode";
import type { Constraint, ConstraintCheckerMap, ConstraintConfig, ConstraintViolationMap } from "./constraints";
import { checkParentChildrenSum } from "./constraintParentChildrenSum";
import type { DateRange } from "./dateRange";

/**
 * The authoritative map of every registered constraint checker.
 * Add new checkers here as the registry grows.
 */
const constraintCheckers: ConstraintCheckerMap = {
  ParentChildrenSum: checkParentChildrenSum,
};

export class BudgetTree {
  readonly root: BudgetTreeNode;
  configs: ConstraintConfig;
  // The root is always the top-level account (e.g., empty string or "Root")
  constructor(root: BudgetTreeNode, configs: ConstraintConfig) {
    this.root = root;
    this.configs = configs;
  }

  /**
   * Creates an empty tree starting at a specific root label (e.g., "Expenses")
   */
  static createEmpty(rootLabel: AccountLabel, configs: ConstraintConfig): BudgetTree {
    return new BudgetTree(new BudgetTreeNode(rootLabel, [], []), configs);
  }

  /**
   * High-level filter that returns a NEW BudgetTree.
   */
  filter(filterRange: DateRange): BudgetTree {
    return new BudgetTree(this.root.filter(filterRange), this.configs);
  }

  /**
   * Public insert: handles the logic of calling the recursive insert function.
   */
  insert(targetLabel: AccountLabel, inst: BudgetInstance): BudgetTree {
    // We call your existing standalone function and wrap the result
    const newRoot = insertBudget(this.root, targetLabel, inst);
    return new BudgetTree(newRoot, this.configs);
  }

  /**
   * Public delete: handles the logic of calling the recursive delete function.
   */
  delete(targetLabel: AccountLabel, targetRange: DateRange): BudgetTree {
    const newRoot = deleteBudget(this.root, targetLabel, targetRange);
    return new BudgetTree(newRoot, this.configs);
  }

  /**
   * Traverse every node in the tree, apply each registered constraint checker
   * for every key present in {@link ConstraintConfig}, and return a merged
   * {@link ConstraintViolationMap} accumulating all violations found.
   *
   * `configs` (stored on the tree) is the authoritative list of constraints to
   * run — the checker is looked up from the module-level {@link constraintCheckers}
   * registry.
   */
  validateTree(): ConstraintViolationMap {
    return collectViolations(this.root, this.configs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively collect violations from `node` and all its descendants.
 */
function collectViolations(
  node: BudgetTreeNode,
  configs: ConstraintConfig,
): ConstraintViolationMap {
  // Iterate by configs keys so configs is the authoritative source of what to check.
  let result: ConstraintViolationMap = {};

  for (const key of Object.keys(configs) as Constraint[]) {
    const checker = constraintCheckers[key];
    const config  = configs[key];
    const violations = checker(node, config);
    result = mergeViolations(result, violations);
  }

  // Recurse into children.
  for (const child of node.children) {
    const childViolations = collectViolations(child, configs);
    result = mergeViolations(result, childViolations);
  }

  return result;
}

/**
 * Merge two {@link ConstraintViolationMap} objects, concatenating warning
 * arrays for each constraint key that appears in both.
 */
function mergeViolations(a: ConstraintViolationMap, b: ConstraintViolationMap): ConstraintViolationMap {
  if (Object.keys(b).length === 0) return a;
  if (Object.keys(a).length === 0) return b;

  const result: ConstraintViolationMap = { ...a };
  for (const key of Object.keys(b) as Constraint[]) {
    const bWarnings = b[key];
    if (bWarnings === undefined || bWarnings.length === 0) continue;
    const existing = result[key];
    // TypeScript requires a cast here because the mapped type is indexed.
    (result as Record<Constraint, unknown>)[key] =
      existing !== undefined ? [...existing, ...bWarnings] : [...bWarnings];
  }
  return result;
}
